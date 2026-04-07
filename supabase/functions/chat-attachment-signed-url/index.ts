// supabase/functions/chat-attachment-signed-url/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimitDB, RATE_LIMITS } from "../_shared/rate-limit-db.ts";
import { ensureAuthenticated } from "../_shared/auth.ts";
import { json } from "../_shared/response.ts";


type ReqBody = { attachment_id?: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    // Authenticate the caller (validates JWT, returns service-role client)
    const { sb, email, userId } = await ensureAuthenticated(req.headers.get("Authorization"));

    // DB-backed rate limiting (after client is available)
    const rateLimitResponse = await checkRateLimitDB(req, sb, { ...RATE_LIMITS.chat, keyPrefix: "chat-attachment-signed-url" }, getCorsHeaders(req));
    if (rateLimitResponse) return rateLimitResponse;

    // Check admin status via database flag (consistent with ensureAdmin pattern)
    const { data: prof } = await sb
      .from("user_profiles")
      .select("is_admin")
      .eq("email", email)
      .maybeSingle();

    const role: "admin" | "client" = prof?.is_admin ? "admin" : "client";

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
