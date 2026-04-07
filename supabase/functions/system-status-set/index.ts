// supabase/functions/system-status-set/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimitDB, RATE_LIMITS } from "../_shared/rate-limit-db.ts";
import { ensureAdmin } from "../_shared/auth.ts";
import { json } from "../_shared/response.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  try {
    const { sb } = await ensureAdmin(req.headers.get("authorization"));

    // DB-backed rate limiting (after client is available)
    const rateLimitResponse = await checkRateLimitDB(req, sb, { ...RATE_LIMITS.admin, keyPrefix: "system-status-set" }, getCorsHeaders(req));
    if (rateLimitResponse) return rateLimitResponse;

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
