import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing auth token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;

    const sbUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const user = userData.user;
    const sbAdmin = createClient(supabaseUrl, serviceKey);

    const { data: row, error: rowErr } = await sbAdmin
      .from("billing_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (rowErr) return json({ error: rowErr.message }, 500);
    if (!row?.stripe_customer_id) {
      // nothing to sync yet
      return json({
        subscription_status: "inactive",
        payment_status: "unknown",
        current_period_end: null,
        last_payment_amount: null,
        last_payment_currency: null,
        last_payment_at: null,
      });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });

    // Get newest subscription (or active/trialing if present)
    const subs = await stripe.subscriptions.list({
      customer: row.stripe_customer_id,
      status: "all",
      limit: 10,
    });

    const best =
      subs.data.find(s => s.status === "active") ||
      subs.data.find(s => s.status === "trialing") ||
      subs.data.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];

    if (!best) {
      await sbAdmin.from("billing_subscriptions").update({
        subscription_status: "inactive",
        payment_status: "unknown",
        current_period_end: null,
      }).eq("user_id", user.id);

      return json({
        subscription_status: "inactive",
        payment_status: "unknown",
        current_period_end: null,
        last_payment_amount: null,
        last_payment_currency: null,
        last_payment_at: null,
      });
    }

    // Pull invoice details for amount/status if available
    let payStatus: string | null = null;
    let payAmount: number | null = null;
    let payCurrency: string | null = null;
    let payAt: string | null = null;

    if (best.latest_invoice) {
      const inv = await stripe.invoices.retrieve(best.latest_invoice as string);

      payStatus = inv.status || null;

      // amount_paid is in cents
      if (typeof inv.amount_paid === "number") payAmount = inv.amount_paid / 100;
      payCurrency = inv.currency || null;

      if (typeof inv.status_transitions?.paid_at === "number") {
        payAt = new Date(inv.status_transitions.paid_at * 1000).toISOString();
      }
    }

    // Save to DB (so dashboard reads consistent values)
    await sbAdmin.from("billing_subscriptions").update({
      stripe_subscription_id: best.id,
      subscription_status: best.status,
      current_period_end: best.current_period_end ? new Date(best.current_period_end * 1000).toISOString() : null,
      payment_status: payStatus ?? "unknown",
      last_payment_amount: payAmount,
      last_payment_currency: payCurrency,
      last_payment_at: payAt,
    }).eq("user_id", user.id);

    return json({
      subscription_status: best.status,
      payment_status: payStatus ?? "unknown",
      current_period_end: best.current_period_end ? new Date(best.current_period_end * 1000).toISOString() : null,
      last_payment_amount: payAmount,
      last_payment_currency: payCurrency,
      last_payment_at: payAt,
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
