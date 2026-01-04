// supabase/functions/client-chat-history/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function cors(headers = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...headers,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401, headers: cors({ "Content-Type": "application/json" }) });

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify caller is a real authed user
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors({ "Content-Type": "application/json" }) });
    }

    const { limit = 60 } = await req.json().catch(() => ({}));
    const me = u.user.id;

    // Ensure a thread exists (client <-> admin)
    const { data: thread, error: threadErr } = await admin
      .from("chat_threads")
      .select("id, user_id")
      .eq("user_id", me)
      .maybeSingle();

    if (threadErr) {
      return new Response(JSON.stringify({ error: threadErr.message }), { status: 400, headers: cors({ "Content-Type": "application/json" }) });
    }

    let threadId = thread?.id || null;

    if (!threadId) {
      const { data: created, error: createErr } = await admin
        .from("chat_threads")
        .insert({ user_id: me })
        .select("id")
        .single();

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: cors({ "Content-Type": "application/json" }) });
      }
      threadId = created.id;
    }

    // Pull messages
    const { data: msgs, error: mErr } = await admin
      .from("chat_messages")
      .select("id, thread_id, sender_role, body, created_at, edited_at, edited, deleted, deleted_at, reply_to_id, delivered_at, read_by_client_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (mErr) {
      return new Response(JSON.stringify({ error: mErr.message }), { status: 400, headers: cors({ "Content-Type": "application/json" }) });
    }

    const messages = Array.isArray(msgs) ? msgs : [];
    const messageIds = messages.map(m => m.id);

    // Pull attachments linked to these messages
    let attachmentsByMessage: Record<string, any[]> = {};
    if (messageIds.length) {
      const { data: atts, error: aErr } = await admin
        .from("chat_attachments")
        .select("id, message_id, file_name, mime_type, size_bytes, storage_path, created_at")
        .in("message_id", messageIds);

      if (aErr) {
        return new Response(JSON.stringify({ error: aErr.message }), { status: 400, headers: cors({ "Content-Type": "application/json" }) });
      }

      const list = Array.isArray(atts) ? atts : [];
      attachmentsByMessage = list.reduce((acc: any, a: any) => {
        (acc[a.message_id] ||= []).push(a);
        return acc;
      }, {});
    }

    // Create signed URLs (so your UI can actually display/download)
    const bucket = "chat-attachments";
    const signedTTL = 60 * 30; // 30 min

    const messagesWithAttachments = await Promise.all(
      messages.map(async (m: any) => {
        const atts = attachmentsByMessage[m.id] || [];
        const enriched = [];

        for (const a of atts) {
          const path = a.storage_path;
          let signed_url: string | null = null;

          if (path) {
            const { data: s, error: sErr } = await admin.storage
              .from(bucket)
              .createSignedUrl(path, signedTTL);

            if (!sErr) signed_url = s?.signedUrl || null;
          }

          enriched.push({
            id: a.id,
            message_id: a.message_id,
            file_name: a.file_name,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes,
            storage_path: a.storage_path,
            signed_url,
            created_at: a.created_at,
          });
        }

        return { ...m, attachments: enriched };
      })
    );

    return new Response(
      JSON.stringify({ thread_id: threadId, messages: messagesWithAttachments }),
      { headers: cors({ "Content-Type": "application/json" }) }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: cors({ "Content-Type": "application/json" }),
    });
  }
});
