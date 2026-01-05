// supabase/functions/client-chat-history/index.ts
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

type AttachmentOut = {
  id: string;
  storage_path: string;
  mime_type: string;
  file_name: string;
  size_bytes: number | null;
  uploaded_at: string | null;
  url: string | null;
  signed_url: string | null;
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

    // Optional profile (kept for compatibility with your current response shape)
    const { data: profile } = await sb
      .from("client_profiles")
      .select("contact_name,business_name,email,phone")
      .eq("user_id", uid)
      .maybeSingle();

    // Find thread
    const thread = await sb
      .from("chat_threads")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();

    if (thread.error) return json({ error: thread.error.message }, 500);
    const threadId = thread.data?.id as string | undefined;
    if (!threadId) return json({ ok: true, thread_id: null, messages: [], profile }, 200);

    // Load messages
    const { data: messages, error: msgErr } = await sb
      .from("chat_messages")
      .select("id, thread_id, sender_role, body, created_at, edited_at, deleted_at, delivered_at, reply_to_message_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (msgErr) return json({ error: msgErr.message }, 500);

    const msgIds = (messages || []).map((m) => m.id);
    if (msgIds.length === 0) {
      return json({ ok: true, thread_id: threadId, messages: [], profile }, 200);
    }

    // Load attachments for those messages
    const { data: atts, error: attErr } = await sb
      .from("chat_attachments")
      .select("id, message_id, storage_bucket, storage_path, mime_type, original_name, size_bytes, uploaded_at")
      .in("message_id", msgIds);


    if (attErr) return json({ error: `Failed to load attachments: ${attErr.message}` }, 500);

    // Sign URLs (so browser can render the image)
    const byMessageId = new Map<string, AttachmentOut[]>();

    for (const a of atts || []) {
      const bucket = (a as any).storage_bucket || "chat-attachments";
      const path = a.storage_path as string;
      if (!path) continue;


      let signedUrl: string | null = null;

      // createSignedUrl returns `{ data: { signedUrl } }`
      const signed = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
      signedUrl = signed.data?.signedUrl ?? null;

      const out: AttachmentOut = {
        id: String(a.id),
        storage_path: path,
        mime_type: String(a.mime_type || ""),
        file_name: String(a.original_name || "attachment"),
        size_bytes: (a.size_bytes ?? null) as number | null,
        uploaded_at: (a.uploaded_at ?? null) as string | null,
        url: signedUrl,
        signed_url: signedUrl,
      };


      const mid = String(a.message_id);
      if (!byMessageId.has(mid)) byMessageId.set(mid, []);
      byMessageId.get(mid)!.push(out);
    }

    const merged = (messages || []).map((m) => ({
      ...m,
      attachments: byMessageId.get(String(m.id)) || [],
    }));

    return json(
      {
        ok: true,
        thread_id: threadId,
        messages: merged,
        profile,
      },
      200
    );
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
