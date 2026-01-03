// supabase/functions/chat-attachment-upload-url/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeName(name: string) {
  // remove path separators + keep it short
  return name.replace(/[\/\\]/g, "_").slice(0, 120) || "file";
}

type ReqBody = {
  thread_id?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "").toLowerCase();

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const user = userRes.user;
    const userId = user.id;
    const email = (user.email || "").toLowerCase();
    const uploaderRole: "admin" | "client" = email && ADMIN_EMAIL && email === ADMIN_EMAIL
      ? "admin"
      : "client";

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const threadId = (body.thread_id || "").trim();
    const fileName = safeName((body.file_name || "").trim());
    const mimeType = (body.mime_type || "application/octet-stream").trim();
    const sizeBytes = Number(body.size_bytes || 0);

    if (!threadId) return json({ error: "Missing thread_id" }, 400);
    if (!fileName) return json({ error: "Missing file_name" }, 400);
    if (!mimeType) return json({ error: "Missing mime_type" }, 400);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return json({ error: "Bad size_bytes" }, 400);

    // Validate permissions:
    // - Admin can upload to any thread
    // - Client can upload only to their own thread
    const t = await sb
      .from("chat_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .maybeSingle();

    if (t.error || !t.data) return json({ error: "Thread not found" }, 404);

    if (uploaderRole === "client") {
      if (t.data.user_id !== userId) return json({ error: "Forbidden" }, 403);
    }

    // Storage path is thread-scoped; include timestamp-ish for uniqueness
    const rand = crypto.randomUUID();
    const path = `${threadId}/${rand}_${fileName}`;

    // Signed upload URL (valid for 10 minutes)
    const up = await sb.storage
      .from("chat-attachments")
      .createSignedUploadUrl(path);

    if (up.error) return json({ error: up.error.message }, 400);

    // Insert attachment row now (message_id gets filled when the message is sent)
    const ins = await sb.from("chat_attachments").insert({
      thread_id: threadId,
      message_id: null,
      uploader_user_id: userId,
      uploader_role: uploaderRole,
      storage_bucket: "chat-attachments",
      storage_path: path,
      original_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    }).select("id,storage_bucket,storage_path,original_name,mime_type,size_bytes").single();

    if (ins.error) return json({ error: ins.error.message }, 400);

    return json({
      ok: true,
      upload: {
        attachment_id: ins.data.id,
        bucket: ins.data.storage_bucket,
        path: ins.data.storage_path,
        signed_upload_url: up.data.signedUrl,
        token: up.data.token, // required for the PUT call in some clients
        original_name: ins.data.original_name,
        mime_type: ins.data.mime_type,
        size_bytes: ins.data.size_bytes,
      },
    }, 200);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
