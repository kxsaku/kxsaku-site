// supabase/functions/create-portal-session/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimitDB, RATE_LIMITS } from "../_shared/rate-limit-db.ts";
import { ensureAuthenticated } from "../_shared/auth.ts";
import { json } from "../_shared/response.ts";
import { getEnv } from "../_shared/env.ts";
import { stripePost } from "../_shared/stripe.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  try {
    const SITE_URL = getEnv("SITE_URL").replace(/\/+$/, "");

    // Verify caller is authenticated
    const { sb, userId } = await ensureAuthenticated(req.headers.get("Authorization"));

    // DB-backed rate limiting (after client is available)
    const rateLimitResponse = await checkRateLimitDB(req, sb, { ...RATE_LIMITS.auth, keyPrefix: "create-portal-session" }, getCorsHeaders(req));
    if (rateLimitResponse) return rateLimitResponse;

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
