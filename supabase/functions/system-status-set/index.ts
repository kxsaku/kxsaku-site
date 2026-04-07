// supabase/functions/system-status-set/index.ts
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

async function ensureAdmin(authHeader: string | null) {
  if (!authHeader) throw new Error("Missing Authorization header.");
  const token = authHeader.replace("Bearer", "").trim();
  if (!token) throw new Error("Missing bearer token.");

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user?.email) throw new Error("Unauthorized.");

  const email = userData.user.email;

  const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: prof, error: profErr } = await sb
    .from("user_profiles")
    .select("email,is_admin")
    .eq("email", email)
    .maybeSingle();

  if (profErr) throw profErr;
  if (!prof?.is_admin) throw new Error("Forbidden: admin only.");

  return sb;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for admin endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.admin, keyPrefix: "system-status-set" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const sb = await ensureAdmin(req.headers.get("authorization"));

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "normal").toLowerCase();
    const message = String(body?.message || "").slice(0, 500);

    const allowed = new Set(["normal", "maintenance", "emergency"]);
    if (!allowed.has(mode)) return json(req, { error: "Invalid mode." }, 400);

    const payload = { id: 1, mode, message, updated_at: new Date().toISOString() };

    const { data, error } = await sb
      .from("sns_system_status")
      .upsert(payload, { onConflict: "id" })
      .select("id,mode,message,updated_at")
      .single();

    if (error) throw error;

    return json(req, data);
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
