// supabase/functions/get-billing-status/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      // This is the #1 reason these functions 500 in hosted projects if env is missing.
      return json(500, {
        error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in function env.",
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Missing Authorization bearer token." });
    }

    // IMPORTANT:
    // Use the caller’s JWT (RLS-safe) instead of a service role key.
    // This avoids needing SUPABASE_SERVICE_ROLE_KEY, which is commonly NOT set.
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { error: "Invalid/expired session.", detail: userErr?.message });
    }

    const userId = userData.user.id;

    const { data, error } = await sb
      .from("billing_subscriptions")
      .select("status,current_period_end,last_payment_status,last_payment_amount,last_payment_currency")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return json(500, { error: "DB query failed.", detail: error.message });
    }

    // If no row exists yet (webhook not processed), return nulls cleanly (NOT 500)
    if (!data) {
      return json(200, { subscription: null });
    }

    return json(200, { subscription: data });
  } catch (e) {
    // This makes the 500 actually readable in your browser console.
    return json(500, { error: "Unhandled exception.", detail: String(e) });
  }
});
