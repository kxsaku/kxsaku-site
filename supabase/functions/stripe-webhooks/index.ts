// supabase/functions/stripe-webhooks/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function computeHmacSHA256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Minimal Stripe signature verification for v1
async function verifyStripeSignature(req: Request, body: string) {
  const secret = getEnv("STRIPE_WEBHOOK_SECRET"); // whsec_...
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  const parts = sigHeader.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));
  if (!tPart || v1Parts.length === 0) throw new Error("Missing Stripe signature parts.");

  const t = tPart.slice(2);
  const signedPayload = `${t}.${body}`;
  const expected = await computeHmacSHA256Hex(secret, signedPayload);

  // Accept if ANY v1 signature matches
  const ok = v1Parts
    .map((p) => p.slice(3))
    .some((sig) => timingSafeEqual(expected, sig));

  if (!ok) throw new Error("Invalid Stripe signature.");
}

serve(async (req) => {
  // Rate limiting for webhook endpoints (higher limit since Stripe sends bursts)
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.webhook, keyPrefix: "stripe-webhooks" }, {});
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const body = await req.text();
    await verifyStripeSignature(req, body);

    const event = JSON.parse(body);
    const type = event.type as string;

    console.log("stripe-webhooks:", type);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY);
    const stripe = new Stripe(getEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const pickBestSubscription = (subs: any[]) => {
      const rank: Record<string, number> = {
        active: 1,
        trialing: 2,
        past_due: 3,
        unpaid: 4,
        incomplete: 5,
        incomplete_expired: 6,
        canceled: 7,
      };

      return subs
        .slice()
        .sort((a, b) => {
          const ra = rank[a.status] ?? 99;
          const rb = rank[b.status] ?? 99;
          if (ra !== rb) return ra - rb;
          return Number(b.created ?? 0) - Number(a.created ?? 0);
        })[0] ?? null;
    };

    const upsertByCustomer = async (stripeCustomerId: string, patch: Record<string, unknown>) => {
      const { data: row, error } = await sb
        .from("billing_subscriptions")
        .select("user_id,email,stripe_customer_id")
        .eq("stripe_customer_id", stripeCustomerId)
        .maybeSingle();

      if (error) throw error;
      if (!row?.user_id) return { matched: false as const };

      const { error: upErr } = await sb.from("billing_subscriptions").upsert({
        user_id: row.user_id,
        email: row.email,
        stripe_customer_id: stripeCustomerId,
        ...patch,
      });

      if (upErr) throw upErr;
      return { matched: true as const };
    };

    const upsertByUser = async (
      userId: string,
      email: string | null,
      stripeCustomerId: string | null,
      patch: Record<string, unknown>
    ) => {
      const payload: Record<string, unknown> = {
        user_id: userId,
        ...(email ? { email } : {}),
        ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
        ...patch,
      };

      const { error: upErr } = await sb.from("billing_subscriptions").upsert(payload);
      if (upErr) throw upErr;
    };

    const upsertSubscription = async (
      userId: string,
      email: string,
      stripeCustomerId: string,
      sub: any
    ) => {
      const currentPeriodEnd =
        sub?.current_period_end ? new Date(Number(sub.current_period_end) * 1000).toISOString() : null;

      await upsertByUser(userId, email || null, stripeCustomerId, {
        stripe_subscription_id: sub?.id ?? null,
        status: sub?.status ?? null,
        cancel_at_period_end: Boolean(sub?.cancel_at_period_end),
        current_period_end: currentPeriodEnd,
      });
    };

    switch (type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;

        if (session.mode !== "subscription") break;

        const userId = session.client_reference_id || session.metadata?.user_id;
        const email = session.customer_details?.email || session.metadata?.email;

        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!userId || !customerId || !subscriptionId) {
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await upsertSubscription(userId, email || "", customerId, sub);

        break;
      }

      default:
        break;
    }

    if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    ) {
      const subEvent = event.data.object as any;
      const customer = subEvent.customer as string;

      const list = await stripe.subscriptions.list({ customer, limit: 100, status: "all" });
      const best = pickBestSubscription(list.data);

      if (!best) {
        const patch = {
          stripe_subscription_id: null,
          status: "canceled",
          cancel_at_period_end: false,
          current_period_end: null,
        };
        const res = await upsertByCustomer(customer, patch);
        if (!res.matched) {
          const metaUserId = subEvent.metadata?.user_id as string | undefined;
          const metaEmail = subEvent.metadata?.email as string | undefined;
          if (metaUserId) await upsertByUser(metaUserId, metaEmail ?? null, customer, patch);
        }
      } else {
        const currentPeriodEnd = best.current_period_end
          ? new Date(Number(best.current_period_end) * 1000).toISOString()
          : null;

        const patch = {
          stripe_subscription_id: best.id,
          status: best.status,
          cancel_at_period_end: Boolean(best.cancel_at_period_end),
          current_period_end: currentPeriodEnd,
        };

        const res = await upsertByCustomer(customer, patch);

        if (!res.matched) {
          const metaUserId = (best.metadata?.user_id || subEvent.metadata?.user_id) as string | undefined;
          const metaEmail = (best.metadata?.email || subEvent.metadata?.email) as string | undefined;

          if (metaUserId) {
            await upsertByUser(metaUserId, metaEmail ?? null, customer, patch);
          }
        }
      }
    }

    if (
      type === "invoice.payment_succeeded" ||
      type === "invoice_payment_succeeded" ||
      type === "invoice.paid" ||
      type === "invoice_payment.paid"
    ) {
      const inv = event.data.object;

      const stripeCustomerId = inv.customer as string | null;
      if (stripeCustomerId) {
        const amount =
          typeof inv.amount_paid === "number" ? inv.amount_paid :
          typeof inv.amount_due === "number" ? inv.amount_due :
          null;

        const paidAt =
          inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
            : null;

        await upsertByCustomer(stripeCustomerId, {
          last_payment_status: "paid",
          last_payment_amount: amount != null ? amount / 100 : null,
          last_payment_currency: (inv.currency ?? null),
          last_payment_at: paidAt,
        });
      }
    }

    if (type === "invoice.payment_failed" || type === "invoice_payment_failed") {
      const inv = event.data.object;

      const stripeCustomerId = inv.customer as string | null;
      if (stripeCustomerId) {
        const amount =
          typeof inv.amount_due === "number" ? inv.amount_due :
          typeof inv.amount_paid === "number" ? inv.amount_paid :
          null;

        await upsertByCustomer(stripeCustomerId, {
          last_payment_status: "failed",
          last_payment_amount: amount != null ? amount / 100 : null,
          last_payment_currency: (inv.currency ?? null),
          last_payment_at: null,
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(`Webhook error: ${String((e as any)?.message ?? e)}`, { status: 400 });
  }
});
