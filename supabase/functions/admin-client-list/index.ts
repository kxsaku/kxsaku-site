// supabase/functions/admin-client-list/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type StripeInvoice = {
  id: string;
  amount_paid: number | null;
  currency: string | null;
  status_transitions?: { paid_at?: number | null };
  created?: number | null;
};

async function stripeGet(path: string, qs?: URLSearchParams) {
  const sk = getEnv("STRIPE_SECRET_KEY");
  const url = `https://api.stripe.com/v1/${path}${qs ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${sk}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe error (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function computeStripeMetrics(stripeCustomerId: string | null, stripeSubscriptionId: string | null) {
  const out: {
    stripe_status?: string | null;
    subscription_created_ts?: number | null;
    current_period_end_ts?: number | null;
    total_paid_cents?: number | null;
    currency?: string | null;
    first_paid_ts?: number | null;
    next_invoice_ts?: number | null;
  } = {
    total_paid_cents: null,
    currency: null,
    first_paid_ts: null,
    subscription_created_ts: null,
    current_period_end_ts: null,
    stripe_status: null,
    next_invoice_ts: null,
  };

  // Subscription details (most reliable source for status + current_period_end)
  if (stripeSubscriptionId) {
    const sub = await stripeGet(`subscriptions/${stripeSubscriptionId}`);
    out.stripe_status = sub?.status ?? null;
    out.subscription_created_ts = sub?.created ?? null;
    out.current_period_end_ts = sub?.current_period_end ?? null;

    // Optional: next invoice date (if present)
    // Stripe doesn't always expose a single "next payment due" field beyond current_period_end for subscriptions.
    // current_period_end is your best "next charge boundary".
    out.next_invoice_ts = sub?.current_period_end ?? null;
  }

  // Paid invoices sum (lifetime paid)
  if (stripeCustomerId) {
    let startingAfter: string | null = null;
    let total = 0;
    let currency: string | null = null;
    let firstPaid: number | null = null;

    // paginate (limit 100) until has_more = false
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({
        customer: stripeCustomerId,
        status: "paid",
        limit: "100",
      });
      if (startingAfter) qs.set("starting_after", startingAfter);

      const inv = await stripeGet("invoices", qs);
      const data: StripeInvoice[] = Array.isArray(inv?.data) ? inv.data : [];
      for (const i of data) {
        const paid = typeof i.amount_paid === "number" ? i.amount_paid : 0;
        total += paid;

        if (!currency && i.currency) currency = i.currency;

        const paidAt = (i.status_transitions?.paid_at ?? null) ?? null;
        const createdAt = (i.created ?? null) ?? null;
        const ts = paidAt || createdAt;
        if (ts) {
          if (firstPaid == null || ts < firstPaid) firstPaid = ts;
        }
      }

      const hasMore = !!inv?.has_more;
      if (!hasMore || data.length === 0) break;
      startingAfter = data[data.length - 1]?.id ?? null;
      if (!startingAfter) break;
    }

    out.total_paid_cents = total;
    out.currency = currency;
    out.first_paid_ts = firstPaid;
  }

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for admin endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.admin, keyPrefix: "admin-client-list" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = getEnv("ADMIN_EMAIL").toLowerCase();

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json(req, { error: "Missing Authorization bearer token." }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    // Verify caller is authenticated and is the admin email
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) return json(req, { error: "Invalid session." }, 401);

    const callerEmail = (userData.user.email ?? "").toLowerCase();
    if (callerEmail !== ADMIN_EMAIL) return json(req, { error: "Forbidden." }, 403);

    const body = await req.json().catch(() => ({}));
    const includeStripe = body?.includeStripe !== false; // default true

    // Pull all profiles + billing rows (service role bypasses RLS)
    const { data: profiles, error: pErr } = await sb
      .from("client_profiles")
      .select("user_id,email,contact_name,business_name,phone,business_location,mailing_address,billing_address,created_at,updated_at");

    if (pErr) return json(req, { error: "Failed to read client_profiles.", detail: pErr.message }, 500);

    const { data: subs, error: sErr } = await sb
      .from("billing_subscriptions")
      .select("user_id,email,status,current_period_end,last_payment_status,last_payment_amount,last_payment_currency,stripe_customer_id,stripe_subscription_id,created_at,updated_at");

    if (sErr) return json(req, { error: "Failed to read billing_subscriptions.", detail: sErr.message }, 500);

    const profById = new Map<string, any>();
    for (const p of profiles ?? []) profById.set(p.user_id, p);

    const subById = new Map<string, any>();
    for (const s of subs ?? []) subById.set(s.user_id, s);

    const allIds = new Set<string>();
    for (const p of profiles ?? []) allIds.add(p.user_id);
    for (const s of subs ?? []) allIds.add(s.user_id);

    const clients: any[] = [];

    for (const userId of allIds) {
      const p = profById.get(userId) ?? null;
      const s = subById.get(userId) ?? null;

      // Normalize to what your UI expects (full_name/business/phone/email)
      const profile = {
        user_id: userId,
        email: p?.email ?? s?.email ?? null,
        full_name: p?.contact_name ?? null,
        contact_name: p?.contact_name ?? null,
        business_name: p?.business_name ?? null,
        phone: p?.phone ?? null,
        business_location: p?.business_location ?? null,
        mailing_address: p?.mailing_address ?? null,
        billing_address: p?.billing_address ?? null,
        created_at: p?.created_at ?? null,
        updated_at: p?.updated_at ?? null,
      };

      // Base subscription row from DB
      const subscription: any = {
        user_id: userId,
        email: s?.email ?? profile.email ?? null,
        status: s?.status ?? null,
        current_period_end: s?.current_period_end ?? null,
        last_payment_status: s?.last_payment_status ?? null,
        last_payment_amount: s?.last_payment_amount ?? null,
        last_payment_currency: s?.last_payment_currency ?? null,
        stripe_customer_id: s?.stripe_customer_id ?? null,
        stripe_subscription_id: s?.stripe_subscription_id ?? null,

        // Stripe-derived fields (filled in below if includeStripe)
        stripe_status: null,
        subscription_created_ts: null,
        current_period_end_ts: null,
        next_invoice_ts: null,
        total_paid_cents: null,
        currency: null,
        first_paid_ts: null,

        // Derived category used by your filters
        category: null,
      };

      if (includeStripe && (subscription.stripe_customer_id || subscription.stripe_subscription_id)) {
        try {
          const m = await computeStripeMetrics(subscription.stripe_customer_id, subscription.stripe_subscription_id);
          subscription.stripe_status = m.stripe_status ?? null;
          subscription.subscription_created_ts = m.subscription_created_ts ?? null;
          subscription.current_period_end_ts = m.current_period_end_ts ?? null;
          subscription.next_invoice_ts = m.next_invoice_ts ?? null;
          subscription.total_paid_cents = m.total_paid_cents ?? null;
          subscription.currency = m.currency ?? subscription.last_payment_currency ?? null;
          subscription.first_paid_ts = m.first_paid_ts ?? null;
        } catch (e) {
          // Don't fail the whole page if Stripe has an issue; return partials.
          subscription.stripe_error = String(e?.message ?? e);
        }
      }

      // Category logic:
      // Prefer Stripe status (most correct), fall back to DB status.
      const st = (subscription.stripe_status ?? subscription.status ?? "").toString().toLowerCase();
      const hasStripeLink = !!(subscription.stripe_customer_id || subscription.stripe_subscription_id);
      const hasPaid = (subscription.total_paid_cents ?? null) != null && Number(subscription.total_paid_cents) > 0;

      if (st === "active") subscription.category = "active";
      else if (st === "trialing") subscription.category = "trialing";
      else if (hasStripeLink || hasPaid) subscription.category = "inactive";
      else subscription.category = "never";

      clients.push({ profile, subscription });
    }

    // Sort: active -> trialing -> inactive -> never, then name asc
    const rank = (c: any) => {
      const cat = (c?.subscription?.category ?? "never").toString();
      if (cat === "active") return 0;
      if (cat === "trialing") return 1;
      if (cat === "inactive") return 2;
      return 3;
    };
    clients.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      const na = (a?.profile?.full_name ?? a?.profile?.email ?? "").toString().toLowerCase();
      const nb = (b?.profile?.full_name ?? b?.profile?.email ?? "").toString().toLowerCase();
      return na.localeCompare(nb);
    });

    return json(req, { ok: true, clients });
  } catch (e) {
    console.error(e);
    return json(req, { error: String(e?.message ?? e) }, 500);
  }
});
