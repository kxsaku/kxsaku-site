// supabase/functions/chat-attachment-upload-url/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimitDB, RATE_LIMITS } from "../_shared/rate-limit-db.ts";
import { ensureAuthenticated } from "../_shared/auth.ts";
import { json } from "../_shared/response.ts";


type ReqBody = {
  thread_id: string;
  file_name: string;
  mime_type: string;
  size_bytes?: number | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    // Authenticate the caller (validates JWT, returns service-role client)
    const { sb: admin, email: callerEmail, userId: callerId } = await ensureAuthenticated(req.headers.get("Authorization"));

    // DB-backed rate limiting (after client is available)
    const rateLimitResponse = await checkRateLimitDB(req, admin, { ...RATE_LIMITS.chat, keyPrefix: "chat-attachment-upload-url" }, getCorsHeaders(req));
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await req.json()) as ReqBody;
    const threadId = (body.thread_id || "").trim();
    const fileName = (body.file_name || "").trim();
    const mimeType = (body.mime_type || "application/octet-stream").trim();
    const sizeBytes = body.size_bytes ?? null;

    if (!threadId) return json(req, { error: "Missing thread_id" }, 400);
    if (!fileName) return json(req, { error: "Missing file_name" }, 400);

    // Check admin status via database flag (consistent with ensureAdmin pattern)
    const { data: prof } = await admin
      .from("user_profiles")
      .select("is_admin")
      .eq("email", callerEmail)
      .maybeSingle();

    const isAdmin = !!prof?.is_admin;

    // Get thread owner
    const th = await admin
      .from("chat_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .maybeSingle();

    if (th.error) return json(req, { error: th.error.message }, 500);
    if (!th.data) return json(req, { error: "Thread not found" }, 404);

    const threadOwnerId = th.data.user_id as string;
    const isOwner = callerId === threadOwnerId;

    // Only allow: thread owner (client) OR admin email
    if (!isOwner && !isAdmin) {
      return json(req, { error: "Forbidden" }, 403);
    }

    // Bucket name must match exactly
    const bucket = "chat-attachments";

    // Safer path: thread/<threadId>/<timestamp>_<rand>_<filename>
    const safeName = fileName.replace(/[^\w.\-()\s]/g, "_").slice(0, 120);
    const rand = crypto.randomUUID().slice(0, 8);
    const ts = Date.now();
    const path = `thread/${threadId}/${ts}_${rand}_${safeName}`;

    // Create attachment row first (SERVICE ROLE insert; no RLS)
    const ins = await admin
      .from("chat_attachments")
      .insert({
        thread_id: threadId,
        message_id: null,
        storage_bucket: bucket,
        storage_path: path,
        original_name: fileName,
        filename: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        uploader_user_id: callerId,
        uploader_role: isAdmin ? "admin" : "client",
      })
      .select("id,storage_path")
      .single();

    if (ins.error) return json(req, { error: ins.error.message }, 400);

    // Create signed upload URL (Storage bucket must exist)
    const up = await admin.storage.from(bucket).createSignedUploadUrl(path);
    if (up.error) return json(req, { error: up.error.message }, 400);

    return json(req, {
      ok: true,
      upload: {
        attachment_id: ins.data.id,
        path,
        token: up.data.token,
        signed_upload_url: up.data.signedUrl,
      },
    });
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
