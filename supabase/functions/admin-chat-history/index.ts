// supabase/functions/admin-chat-send/index.ts
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

type ReqBody = {
  user_id?: string; // target client user_id
  body?: string;
  reply_to_message_id?: string | null;

  // attachments passed from UI after upload
  attachments?: Array<{
    storage_path: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = (getEnv("ADMIN_EMAIL") || "").toLowerCase();

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify caller is admin
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);

    const adminUid = userData.user?.id;
    const callerEmail = (userData.user?.email || "").toLowerCase();
    if (!adminUid || !callerEmail || callerEmail !== ADMIN_EMAIL) {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const targetUserId = (body.user_id || "").trim();
    const text = (body.body || "").trim();
    const replyTo = (body.reply_to_message_id || null) as string | null;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!targetUserId) return json({ error: "Missing user_id" }, 400);

    // IMPORTANT:
    // Admin is allowed to send an "attachment-only" message.
    if (!text && attachments.length === 0) {
      return json({ error: "Missing body (or attachments)" }, 400);
    }

    const nowIso = new Date().toISOString();

    // Find thread for this client
    const th = await sb
      .from("chat_threads")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (th.error) return json({ error: th.error.message }, 500);

    let threadId = th.data?.id as string | undefined;

    // If thread doesn't exist yet, create it
    if (!threadId) {
      const preview =
        text.slice(0, 140) ||
        (attachments.length ? `[Attachment] ${attachments[0]?.original_name || ""}`.trim() : "");

      const insThread = await sb
        .from("chat_threads")
        .insert({
          user_id: targetUserId,
          last_admin_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: preview,
          last_sender_role: "admin",
          unread_for_client: true,
          unread_for_admin: false,
        })
        .select("id")
        .single();

      if (insThread.error) return json({ error: insThread.error.message }, 500);
      threadId = insThread.data.id;
    } else {
      const preview =
        text.slice(0, 140) ||
        (attachments.length ? `[Attachment] ${attachments[0]?.original_name || ""}`.trim() : "");

      const updThread = await sb
        .from("chat_threads")
        .update({
          last_admin_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: preview,
          last_sender_role: "admin",
          unread_for_client: true,
        })
        .eq("id", threadId);

      if (updThread.error) return json({ error: updThread.error.message }, 500);
    }

    // Insert message (body can be empty if attachments exist)
    const insMsg = await sb
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "admin",
        body: text,
        reply_to_message_id: replyTo,
        created_at: nowIso,
        delivered_at: nowIso,
      })
      .select("id, sender_role, body, created_at, edited_at, deleted_at, delivered_at")
      .single();

    if (insMsg.error) return json({ error: insMsg.error.message }, 500);

    // Link attachments to this message (THIS is what makes history work)
    if (attachments.length > 0) {
      const rows = attachments
        .filter((a) => a?.storage_path && a?.original_name && a?.mime_type)
        .map((a) => ({
          thread_id: threadId,
          message_id: insMsg.data.id,
          uploader_user_id: adminUid,
          uploader_role: "admin",
          storage_bucket: "chat-attachments",
          storage_path: a.storage_path,
          original_name: a.original_name,
          mime_type: a.mime_type,
          size_bytes: Number(a.size_bytes || 0),
        }));

      if (rows.length > 0) {
        const insAtt = await sb.from("chat_attachments").insert(rows);
        if (insAtt.error) return json({ error: insAtt.error.message }, 500);
      }
    }

    // Return message + signed URLs so UI can render immediately
    const signedAttachments: any[] = [];
    if (attachments.length > 0) {
      for (const a of attachments) {
        const path = (a?.storage_path || "").trim();
        if (!path) continue;

        const signed = await sb.storage
          .from("chat-attachments")
          .createSignedUrl(path, 60 * 10);

        const signedUrl = signed.data?.signedUrl || null;

        signedAttachments.push({
          original_name: a.original_name || null,
          file_name: a.original_name || null,
          mime_type: a.mime_type || null,
          size_bytes: Number(a.size_bytes || 0),
          storage_bucket: "chat-attachments",
          storage_path: path,
          signed_url: signedUrl,
          url: signedUrl,
        });
      }
    }

    return json(
      {
        ok: true,
        thread_id: threadId,
        message: {
          id: insMsg.data.id,
          sender_role: "admin",
          body: text,
          created_at: insMsg.data.created_at,
          edited: !!insMsg.data.edited_at,
          deleted: !!insMsg.data.deleted_at,
          delivered_at: insMsg.data.delivered_at || null,
          attachments: signedAttachments,
        },
      },
      200
    );
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
