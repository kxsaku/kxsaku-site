// supabase/functions/chat-attachment-signed-url/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type ReqBody = { attachment_id?: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for chat endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.chat, keyPrefix: "chat-attachment-signed-url" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "").toLowerCase();

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "Missing Authorization bearer token" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes?.user) return json(req, { error: "Unauthorized" }, 401);

    const user = userRes.user;
    const userId = user.id;
    const email = (user.email || "").toLowerCase();
    const role: "admin" | "client" =
      email && ADMIN_EMAIL && email === ADMIN_EMAIL ? "admin" : "client";

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const attachmentId = (body.attachment_id || "").trim();
    if (!attachmentId) return json(req, { error: "Missing attachment_id" }, 400);

    // Load attachment + thread owner
    const a = await sb
      .from("chat_attachments")
      .select("id, thread_id, storage_bucket, storage_path")
      .eq("id", attachmentId)
      .maybeSingle();

    if (a.error || !a.data) return json(req, { error: "Attachment not found" }, 404);

    const t = await sb
      .from("chat_threads")
      .select("id, user_id")
      .eq("id", a.data.thread_id)
      .maybeSingle();

    if (t.error || !t.data) return json(req, { error: "Thread not found" }, 404);

    // Permission: admin can sign anything; client can sign only their own thread
    if (role === "client" && t.data.user_id !== userId) {
      return json(req, { error: "Forbidden" }, 403);
    }

    // Signed URL (10 min)
    const signed = await sb.storage
      .from(a.data.storage_bucket)
      .createSignedUrl(a.data.storage_path, 60 * 10);

    if (signed.error) return json(req, { error: signed.error.message }, 400);

    return json(req, { ok: true, url: signed.data.signedUrl }, 200);
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
