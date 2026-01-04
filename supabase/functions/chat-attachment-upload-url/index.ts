// supabase/functions/chat-attachment-upload-url/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });
}

type ReqBody = {
  thread_id: string;
  file_name: string;
  mime_type: string;
  size_bytes?: number | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = (getEnv("ADMIN_EMAIL") || "").toLowerCase();

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json()) as ReqBody;
    const threadId = (body.thread_id || "").trim();
    const fileName = (body.file_name || "").trim();
    const mimeType = (body.mime_type || "application/octet-stream").trim();
    const sizeBytes = body.size_bytes ?? null;

    if (!threadId) return json(req, { error: "Missing thread_id" }, 400);
    if (!fileName) return json(req, { error: "Missing file_name" }, 400);

    // Use SERVICE ROLE for everything here (bypasses RLS),
    // but we will enforce permissions manually.
    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Identify caller
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json(req, { error: "Unauthorized" }, 401);
    }

    const callerId = userData.user.id;
    const callerEmail = (userData.user.email || "").toLowerCase();

    // Get thread owner
    const th = await admin
      .from("chat_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .maybeSingle();

    if (th.error) return json(req, { error: th.error.message }, 500);
    if (!th.data) return json(req, { error: "Thread not found" }, 404);

    const threadOwnerId = th.data.user_id as string;

    const isAdmin = callerEmail && callerEmail === ADMIN_EMAIL;
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
