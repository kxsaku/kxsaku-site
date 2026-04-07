// supabase/functions/system-status-get/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for public endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.public, keyPrefix: "system-status-get" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await sb
      .from("sns_system_status")
      .select("id,mode,message,updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const init = { id: 1, mode: "normal", message: "", updated_at: new Date().toISOString() };
      const { data: ins, error: insErr } = await sb
        .from("sns_system_status")
        .insert(init)
        .select("id,mode,message,updated_at")
        .single();
      if (insErr) throw insErr;
      return json(req, ins);
    }

    return json(req, data);
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
