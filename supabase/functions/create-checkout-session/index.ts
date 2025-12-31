// supabase/functions/create-checkout-session/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SITE_URL = getEnv("SITE_URL").replace(/\/+$/, "");
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const PRICE_ID = getEnv("STRIPE_PRICE_ID");

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Authorization bearer token." }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    // Identify the authenticated user
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid session." }, 401);

    const user = userData.user;
    const email = (user.email ?? "").toLowerCase();
    if (!email) return json({ error: "User email not found." }, 400);

    // Look up existing Stripe customer ID (if any)
    const { data: subRow, error: subErr } = await sb
      .from("billing_subscriptions")
      .select("stripe_customer_id,status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) throw subErr;

    // Block creating another checkout if already active (optional safeguard)
    if (subRow?.status === "active") {
      return json({ error: "Subscription is already active." }, 400);
    }

    let stripeCustomerId = subRow?.stripe_customer_id ?? null;

    // Create Stripe customer if needed
    if (!stripeCustomerId) {
      const cust = await stripePost("customers", new URLSearchParams({ email }));
      stripeCustomerId = cust.id;

      await sb.from("billing_subscriptions").upsert({
        user_id: user.id,
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
    params.set("client_reference_id", user.id);
    params.set("metadata[user_id]", user.id);
    params.set("metadata[email]", email);

    // IMPORTANT: also attach mapping to the *subscription* so customer.subscription.* events can map to user
    params.set("subscription_data[metadata][user_id]", user.id);
    params.set("subscription_data[metadata][email]", email);


    const session = await stripePost("checkout/sessions", params);

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
