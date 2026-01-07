// supabase/functions/admin-chat-history/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

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

type ReqBody = {
  user_id?: string;
  limit?: number;
};

type AttachmentOut = {
  id: string;
  storage_path: string;
  mime_type: string;
  file_name: string;
  size_bytes: number | null;
  url: string | null;
  signed_url: string | null;
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
    });

    // Verify caller is admin
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);

    const callerEmail = (userData.user?.email || "").toLowerCase();
    if (!callerEmail || callerEmail !== ADMIN_EMAIL) {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const targetUserId = (body.user_id || "").trim();
    const limit = Math.max(1, Math.min(200, Number(body.limit || 60)));

    if (!targetUserId) return json({ error: "Missing user_id" }, 400);

    // Find thread for this client
    const thread = await sb
      .from("chat_threads")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (thread.error) return json({ error: thread.error.message }, 500);
    const threadId = thread.data?.id as string | undefined;

    if (!threadId) {
      return json({ ok: true, thread_id: null, messages: [] }, 200);
    }

    // Load most recent messages then reverse so UI sees chronological order
    const { data: rawMsgs, error: msgErr } = await sb
      .from("chat_messages")
      .select(
        "id, thread_id, sender_role, body, created_at, edited_at, deleted_at, delivered_at, read_by_client_at, reply_to_message_id, original_body"
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (msgErr) return json({ error: msgErr.message }, 500);

    const messages = (rawMsgs || []).slice().reverse();
    const msgIds = messages.map((m) => m.id);

    if (msgIds.length === 0) {
      return json({ ok: true, thread_id: threadId, messages: [] }, 200);
    }

    // Load attachments for those messages
    const { data: atts, error: attErr } = await sb
      .from("chat_attachments")
      .select("id, message_id, storage_bucket, storage_path, mime_type, original_name, size_bytes")
      .in("message_id", msgIds);

    if (attErr) {
      return json({ error: `Failed to load attachments: ${attErr.message}` }, 500);
    }

    // Sign URLs and group by message_id
    const byMessageId = new Map<string, AttachmentOut[]>();

    for (const a of atts || []) {
      const bucket = (a as any).storage_bucket || "chat-attachments";
      const path = a.storage_path as string;
      if (!path) continue;

      const signed = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
      const signedUrl = signed.error ? null : (signed.data?.signedUrl ?? null);

      const out: AttachmentOut = {
        id: String(a.id),
        storage_path: path,
        mime_type: String(a.mime_type || ""),
        file_name: String(a.original_name || "attachment"),
        size_bytes: (a.size_bytes ?? null) as number | null,
        url: signedUrl,
        signed_url: signedUrl,
      };

      const mid = String(a.message_id);
      if (!byMessageId.has(mid)) byMessageId.set(mid, []);
      byMessageId.get(mid)!.push(out);
    }

    const merged = (messages || []).map((m) => ({
      id: m.id,
      thread_id: m.thread_id,
      sender_role: m.sender_role,
      body: m.body,
      created_at: m.created_at,
      delivered_at: m.delivered_at ?? null,
      read_by_client_at: m.read_by_client_at ?? null,
      reply_to_message_id: m.reply_to_message_id ?? null,

      // keep both “*_at” fields AND booleans for UI compatibility
      edited_at: m.edited_at ?? null,
      deleted_at: m.deleted_at ?? null,
      edited: !!m.edited_at,
      deleted: !!m.deleted_at,

      // admin-only field (your UI uses a separate function to view original, but keeping it is fine)
      original_body: m.original_body ?? null,

      attachments: byMessageId.get(String(m.id)) || [],
    }));

    return json({ ok: true, thread_id: threadId, messages: merged }, 200);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
