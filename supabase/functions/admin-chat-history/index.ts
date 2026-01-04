// supabase/functions/admin-chat-history/index.ts
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
  user_id?: string;
  limit?: number;
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

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify caller identity (must be ADMIN_EMAIL)
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);

    const callerEmail = (userData.user?.email || "").toLowerCase();
    if (!callerEmail || callerEmail !== ADMIN_EMAIL) {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const user_id = (body.user_id || "").trim();
    const limit = Math.max(1, Math.min(200, Number(body.limit || 60)));

    if (!user_id) return json({ error: "Missing user_id" }, 400);

    // 1) Find thread for this client (expected table: chat_threads)
    //    If table doesn't exist yet, return empty messages gracefully.
    const threadRes = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (threadRes.error) {
      // Missing table or permissions => return empty, do not hard-fail the UI.
      return json({
        ok: true,
        messages: [],
        warning:
          "chat_threads not found (or inaccessible). Create chat tables next.",
      });
    }

    const threadId = threadRes.data?.id;
    if (!threadId) {
      return json({ ok: true, messages: [] });
    }

    // Clear admin unread flag now that the admin opened this thread
    // Non-fatal if the column does not exist yet.
    try {
      await admin.from("chat_threads").update({ unread_for_admin: false }).eq("id", threadId);
    } catch (_) {}


    // 2) Fetch messages (expected table: chat_messages)
    const msgRes = await admin
      .from("chat_messages")
      .select(
        "id, sender_role, body, created_at, edited_at, original_body, deleted_at, delivered_at, read_by_client_at, reply_to_message_id",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit);
    
    if (msgRes.error) {
      return json({
        ok: true,
        messages: [],
        warning:
          "chat_messages not found (or inaccessible). Create chat tables next.",
      });
    }

    const msgIds = (msgRes.data || []).map((m) => m.id).filter(Boolean);

let attByMsg: Record<string, any[]> = {};
if (msgIds.length > 0) {
  const attRes = await admin
    .from("chat_attachments")
    .select("id,message_id,original_name,mime_type,size_bytes,storage_path,created_at")
    .eq("thread_id", threadId)
    .in("message_id", msgIds)
    .order("created_at", { ascending: true });

  if (attRes.error) return json({ error: attRes.error.message }, 500);

  attByMsg = (attRes.data || []).reduce((acc: Record<string, any[]>, a: any) => {
    const k = a.message_id;
    if (!acc[k]) acc[k] = [];
    acc[k].push({
      id: a.id,
      storage_path: a.storage_path,
      filename: a.original_name,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes ?? null,
      created_at: a.created_at,
    });
    return acc;
  }, {});
}


    const messages = (msgRes.data || []).map((m) => {
      const deleted = !!m.deleted_at;
      const edited = !!m.edited_at;

      return {
        id: m.id,
        sender_role: m.sender_role, // "admin" | "client"
        body: m.body,
        created_at: m.created_at,
        edited,
        original_body: m.original_body || null,
        deleted,
        delivered_at: m.delivered_at || null,
        read_by_client_at: m.read_by_client_at || null,
        reply_to_message_id: m.reply_to_message_id || null,
        attachments: attByMsg[m.id] || [],
      };
    });

    return json({ ok: true, thread_id: threadId, messages });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
