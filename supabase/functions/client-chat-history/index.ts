// supabase/functions/client-chat-history/index.ts
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
  limit?: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Identify caller
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);

    const uid = userData.user?.id;
    if (!uid) return json({ error: "No user found" }, 401);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const limit = Math.min(Math.max(body.limit ?? 200, 1), 500);

    // Find (or create) the one thread for this user
    const threadRes = await sb
      .from("chat_threads")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();

    if (threadRes.error) return json({ error: threadRes.error.message }, 500);

    let threadId = threadRes.data?.id as string | undefined;

    if (!threadId) {
      const nowIso = new Date().toISOString();
      const ins = await sb
        .from("chat_threads")
        .insert({
          user_id: uid,
          last_message_at: nowIso,
          last_message_preview: "",
          last_sender_role: "client",
          unread_for_admin: false,
          unread_for_client: false,
        })
        .select("id")
        .single();

      if (ins.error) return json({ error: ins.error.message }, 500);
      threadId = ins.data.id;
    }

    // Load messages
    const { data: messages, error: mErr } = await sb
      .from("chat_messages")
      .select(
        "id, sender_role, body, created_at, edited_at, deleted_at, delivered_at, reply_to_message_id"
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (mErr) return json({ error: mErr.message }, 500);

    const msgIds = (messages || []).map((m) => m.id);
    if (msgIds.length === 0) {
      return json({ ok: true, thread_id: threadId, messages: [] }, 200);
    }

    // Load attachments for those messages (schema matches your upload-url/admin history)
    const { data: atts, error: aErr } = await sb
      .from("chat_attachments")
      .select("id, message_id, storage_bucket, storage_path, original_name, mime_type, size_bytes")
      .in("message_id", msgIds);

    if (aErr) return json({ error: aErr.message }, 500);

    // Build signed URLs (short-lived)
    const attByMsg = new Map<string, any[]>();
    for (const a of atts || []) {
      const bucket = a.storage_bucket || "chat-attachments";
      const path = a.storage_path;

      let signed_url: string | null = null;
      try {
        const { data: s, error: sErr } = await sb.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 5); // 5 minutes
        if (!sErr) signed_url = s?.signedUrl ?? null;
      } catch (_) {
        signed_url = null;
      }

      const shaped = {
        id: a.id,
        message_id: a.message_id,
        file_name: a.original_name,        // IMPORTANT: frontend expects file_name
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        storage_bucket: bucket,
        storage_path: path,
        signed_url,
      };

      const arr = attByMsg.get(a.message_id) || [];
      arr.push(shaped);
      attByMsg.set(a.message_id, arr);
    }

    // Attach attachments[] onto each message (frontend expects this)
    const out = (messages || []).map((m) => ({
      ...m,
      attachments: attByMsg.get(m.id) || [],
    }));

    return json({ ok: true, thread_id: threadId, messages: out }, 200);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
