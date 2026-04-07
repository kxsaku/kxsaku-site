// supabase/functions/create-checkout-session/index.ts
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
    const PRICE_ID = getEnv("STRIPE_PRICE_ID");

    // Verify caller is authenticated
    const { sb, email, userId } = await ensureAuthenticated(req.headers.get("Authorization"));

    // DB-backed rate limiting (after client is available)
    const rateLimitResponse = await checkRateLimitDB(req, sb, { ...RATE_LIMITS.auth, keyPrefix: "create-checkout-session" }, getCorsHeaders(req));
    if (rateLimitResponse) return rateLimitResponse;

    // Look up existing Stripe customer ID (if any)
    const { data: subRow, error: subErr } = await sb
      .from("billing_subscriptions")
      .select("stripe_customer_id,status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) throw subErr;

    // Block creating another checkout if already active (optional safeguard)
    if (subRow?.status === "active") {
      return json(req, { error: "Subscription is already active." }, 400);
    }

    let stripeCustomerId = subRow?.stripe_customer_id ?? null;

    // Create Stripe customer if needed
    if (!stripeCustomerId) {
      const cust = await stripePost("customers", new URLSearchParams({ email }));
      stripeCustomerId = cust.id;

      await sb.from("billing_subscriptions").upsert({
        user_id: userId,
        email,
        stripe_customer_id: stripeCustomerId,
        status: subRow?.status ?? "inactive",
      });
    }

    // Create Checkout Session (subscription) with one-time $100 initiation added to first invoice
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("customer", stripeCustomerId);

    // 1) One-time initiation fee ($100) charged immediately
    params.set("line_items[0][price_data][currency]", "usd");
    params.set("line_items[0][price_data][product_data][name]", "SNS Initiation Fee (Non-refundable)");
    params.set("line_items[0][price_data][unit_amount]", "10000");
    params.set("line_items[0][quantity]", "1");

    // 2) Monthly subscription ($75/mo) starts after ~30 days
    params.set("line_items[1][price]", PRICE_ID);
    params.set("line_items[1][quantity]", "1");

    // Delay the subscription billing; the $100 still charges now
    params.set("subscription_data[trial_period_days]", "30");

    params.set("payment_method_types[0]", "card");

    params.set(
      "success_url",
      `${SITE_URL}/sns-subscribe-success/index.html?session_id={CHECKOUT_SESSION_ID}`
    );
    params.set("cancel_url", `${SITE_URL}/sns-subscribe-cancel/index.html`);

    // Helpful mapping (checkout session)
    params.set("client_reference_id", userId);
    params.set("metadata[user_id]", userId);
    params.set("metadata[email]", email);

    // IMPORTANT: also attach mapping to the *subscription* so customer.subscription.* events can map to user
    params.set("subscription_data[metadata][user_id]", userId);
    params.set("subscription_data[metadata][email]", email);

    const session = await stripePost("checkout/sessions", params);

    return json(req, { url: session.url });
  } catch (e) {
    console.error(e);
    return json(req, { error: String((e as any)?.message ?? e) }, 500);
  }
});
