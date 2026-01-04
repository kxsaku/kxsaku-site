// supabase/functions/client-chat-history/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

type MsgRow = {
  id: string;
  sender_role: "admin" | "client";
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  delivered_at: string | null;
  read_by_client_at: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders(req));

  try {
    const SUPABASE_URL = getEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });

    // Auth required (client is the logged-in user)
    const { data: auth, error: authErr } = await sb.auth.getUser();
    if (authErr || !auth?.user) return json({ error: "Unauthorized" }, 401, corsHeaders(req));

    const userId = auth.user.id;

    // Ensure thread exists
    const thRes = await sb.from("chat_threads").select("id").eq("user_id", userId).maybeSingle();
    if (thRes.error) return json({ error: thRes.error.message }, 500, corsHeaders(req));

    let threadId = thRes.data?.id as string | undefined;

    if (!threadId) {
      const ins = await sb
        .from("chat_threads")
        .insert({ user_id: userId, unread_for_admin: false, unread_for_client: false })
        .select("id")
        .single();

      if (ins.error) return json({ error: ins.error.message }, 500, corsHeaders(req));
      threadId = ins.data.id;
    }

    // Fetch messages
    const msgRes = await sb
      .from("chat_messages")
      .select("id,sender_role,body,created_at,edited_at,deleted_at,delivered_at,read_by_client_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (msgRes.error) return json({ error: msgRes.error.message }, 500, corsHeaders(req));

    // Fetch attachments for those messages (uses original_name, NOT filename)
    const msgIds = (msgRes.data || []).map((m: any) => m.id).filter(Boolean);

    let attByMsg: Record<string, any[]> = {};
    if (msgIds.length > 0) {
      const attRes = await sb
        .from("chat_attachments")
        .select("id,message_id,storage_bucket,storage_path,original_name,mime_type,size_bytes,created_at")
        .eq("thread_id", threadId)
        .in("message_id", msgIds)
        .order("created_at", { ascending: true });

      if (attRes.error) return json({ error: attRes.error.message }, 500, corsHeaders(req));

      attByMsg = (attRes.data || []).reduce((acc: Record<string, any[]>, a: any) => {
        const k = a.message_id;
        if (!acc[k]) acc[k] = [];
        acc[k].push({
          id: a.id,
          storage_bucket: a.storage_bucket,
          storage_path: a.storage_path,
          original_name: a.original_name,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes ?? null,
          created_at: a.created_at,
        });
        return acc;
      }, {});
    }

    // Clear client's unread when opening chat
    const upd = await sb.from("chat_threads").update({ unread_for_client: false }).eq("id", threadId);
    if (upd.error) console.warn("Failed to clear unread_for_client:", upd.error.message);

    // Mark admin messages as read-by-client now (read receipts visible to admin only)
    const nowIso = new Date().toISOString();
    const markRead = await sb
      .from("chat_messages")
      .update({ read_by_client_at: nowIso })
      .eq("thread_id", threadId)
      .eq("sender_role", "admin")
      .is("read_by_client_at", null);

    if (markRead.error) console.warn("Failed to mark read receipts:", markRead.error.message);

    const messages = (msgRes.data as MsgRow[] | null | undefined || []).map((m) => ({
      id: m.id,
      sender_role: m.sender_role,
      body: m.deleted_at ? "Deleted Message" : m.body,
      created_at: m.created_at,
      edited: !!m.edited_at,
      deleted: !!m.deleted_at,
      delivered_at: m.delivered_at || null,
      read_by_client_at: m.read_by_client_at || null,
      attachments: attByMsg[m.id] || [],
    }));

    return json({ ok: true, thread_id: threadId, messages }, 200, corsHeaders(req));
  } catch (e) {
    return json({ error: (e as any)?.message || String(e) }, 500, corsHeaders(req));
  }
});
