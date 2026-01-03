// supabase/functions/client-chat-history/index.ts
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
    const limit = Math.max(1, Math.min(200, Number(body.limit || 60)));

    // Ensure thread exists (one per user)
    const thread = await sb
      .from("chat_threads")
      .select("id, user_id, unread_for_client")
      .eq("user_id", uid)
      .maybeSingle();

    if (thread.error) return json({ error: thread.error.message }, 500);

    let threadId = thread.data?.id as string | undefined;

    if (!threadId) {
      const ins = await sb
        .from("chat_threads")
        .insert({ user_id: uid })
        .select("id")
        .single();

      if (ins.error) return json({ error: ins.error.message }, 500);
      threadId = ins.data.id;
    }

    // Fetch messages
    const msgRes = await sb
      .from("chat_messages")
      .select(
        "id, sender_role, body, created_at, edited_at, deleted_at, delivered_at",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (msgRes.error) return json({ error: msgRes.error.message }, 500);

    // Mark client's unread as false (client just opened history)
    const upd = await sb
      .from("chat_threads")
      .update({ unread_for_client: false })
      .eq("id", threadId);

    if (upd.error) {
      // Non-fatal
      console.warn("Failed to clear unread_for_client:", upd.error.message);
    }

    // Mark admin messages as read_by_client_at now (read receipt for admin only)
    const nowIso = new Date().toISOString();
    const markRead = await sb
      .from("chat_messages")
      .update({ read_by_client_at: nowIso })
      .eq("thread_id", threadId)
      .eq("sender_role", "admin")
      .is("read_by_client_at", null);

    if (markRead.error) {
      // Non-fatal
      console.warn("Failed to mark read receipts:", markRead.error.message);
    }

    const messages = (msgRes.data || []).map((m) => ({
      id: m.id,
      sender_role: m.sender_role, // admin|client
      body: m.deleted_at ? "Deleted Message" : m.body,
      created_at: m.created_at,
      edited: !!m.edited_at,
      deleted: !!m.deleted_at,
      delivered_at: m.delivered_at || null,
    }));

    return json({ ok: true, thread_id: threadId, messages });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
