// supabase/functions/get-billing-status/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Identify the signed-in user from the JWT passed by the browser
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    // 2) Use service-role to read billing state (bypasses RLS safely inside function)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: row, error: rowErr } = await admin
      .from("billing_subscriptions")
      .select(
        "status, payment_status, current_period_end, last_payment_amount_cents, last_payment_currency"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (rowErr) {
      return json({ error: rowErr.message }, 500);
    }

    // No row yet => not subscribed
    if (!row) {
      return json({
        status: "inactive",
        payment_status: "unknown",
        current_period_end: null,
        last_payment_amount_cents: null,
        last_payment_currency: null,
      });
    }

    return json(row);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
