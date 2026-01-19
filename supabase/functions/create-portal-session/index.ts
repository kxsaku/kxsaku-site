// supabase/functions/create-portal-session/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { ensureAuthenticated } from "../_shared/auth.ts";

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

async function stripePost(path: string, params: URLSearchParams) {
  const sk = getEnv("STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe error (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for auth-related endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.auth, keyPrefix: "create-portal-session" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const SITE_URL = getEnv("SITE_URL").replace(/\/+$/, "");

    // Verify caller is authenticated
    const { sb, userId } = await ensureAuthenticated(req.headers.get("Authorization"));

    const { data: subRow, error: subErr } = await sb
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) throw subErr;

    const customerId = subRow?.stripe_customer_id;
    if (!customerId) return json(req, { error: "No Stripe customer found for this user." }, 400);

    const portal = await stripePost(
      "billing_portal/sessions",
      new URLSearchParams({
        customer: customerId,
        return_url: `${SITE_URL}/sns-dashboard/index.html`,
      })
    );

    return json(req, { url: portal.url });
  } catch (e) {
    console.error(e);
    return json(req, { error: String((e as any)?.message ?? e) }, 500);
  }
});
