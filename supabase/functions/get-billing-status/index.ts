// supabase/functions/get-billing-status/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.public, keyPrefix: "get-billing-status" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json(req, 500, {
        error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in function env.",
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(req, 401, { error: "Missing Authorization bearer token." });
    }

    // Use the caller's JWT (RLS-safe)
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      return json(req, 401, { error: "Invalid/expired session.", detail: userErr?.message });
    }

    const userId = userData.user.id;

    const { data, error } = await sb
      .from("billing_subscriptions")
      .select("status,current_period_end,last_payment_status,last_payment_amount,last_payment_currency")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return json(req, 500, { error: "DB query failed.", detail: error.message });
    }

    // If no row exists yet (webhook not processed), return nulls cleanly
    if (!data) {
      return json(req, 200, { subscription: null });
    }

    return json(req, 200, { subscription: data });
  } catch (e) {
    return json(req, 500, { error: "Unhandled exception.", detail: String(e) });
  }
});
