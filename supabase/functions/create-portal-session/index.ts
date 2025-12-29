// supabase/functions/create-portal-session/index.ts
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

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Authorization bearer token." }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid session." }, 401);

    const user = userData.user;

    const { data: subRow, error: subErr } = await sb
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) throw subErr;

    const customerId = subRow?.stripe_customer_id;
    if (!customerId) return json({ error: "No Stripe customer found for this user." }, 400);

    const portal = await stripePost(
      "billing_portal/sessions",
      new URLSearchParams({
        customer: customerId,
        return_url: `${SITE_URL}/sns-dashboard/index.html`,
      })
    );

    return json({ url: portal.url });
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
