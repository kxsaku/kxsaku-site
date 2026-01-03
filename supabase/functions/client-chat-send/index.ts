// supabase/functions/client-chat-send/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  body?: string;
  reply_to_message_id?: string | null;
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
    const text = (body.body || "").trim();
    const replyTo = (body.reply_to_message_id || null) as string | null;

    if (!text) return json({ error: "Missing body" }, 400);

    const nowIso = new Date().toISOString();

    // Ensure thread exists (one per user)
    const thread = await sb
      .from("chat_threads")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();

    if (thread.error) return json({ error: thread.error.message }, 500);

    let threadId = thread.data?.id as string | undefined;

    if (!threadId) {
      const ins = await sb
        .from("chat_threads")
        .insert({
          user_id: uid,
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "client",
          unread_for_admin: true,
          unread_for_client: false,
        })
        .select("id")
        .single();

      if (ins.error) return json({ error: ins.error.message }, 500);
      threadId = ins.data.id;
    } else {
      // Update thread summary + unread flags
      const upd = await sb
        .from("chat_threads")
        .update({
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "client",
          unread_for_admin: true,
        })
        .eq("id", threadId);

      if (upd.error) return json({ error: upd.error.message }, 500);
    }

    // Insert message
    const insMsg = await sb
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "client",
        body: text,
        reply_to_message_id: replyTo,
        created_at: nowIso,
        delivered_at: nowIso,
      })
      .select("id, sender_role, body, created_at, edited_at, deleted_at, delivered_at")
      .single();

    if (insMsg.error) return json({ error: insMsg.error.message }, 500);

    // Thread trigger will keep last_message_* consistent, but we already set it.
    return json({
      ok: true,
      thread_id: threadId,
      message: {
        id: insMsg.data.id,
        sender_role: insMsg.data.sender_role,
        body: insMsg.data.body,
        created_at: insMsg.data.created_at,
        edited: !!insMsg.data.edited_at,
        deleted: !!insMsg.data.deleted_at,
        delivered_at: insMsg.data.delivered_at || null,
      },
    });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
