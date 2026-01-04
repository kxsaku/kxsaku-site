// supabase/functions/client-chat-history/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
}

type ReqBody = { limit?: number };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // verify caller
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Authorization Bearer token" }, 401);

    const authed = createClient(SB_URL, getEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Auth error" }, 401);

    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const limit = Math.min(Math.max(Number(body.limit || 60), 1), 500);

    // thread
    const threadRes = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (threadRes.error) return json({ error: threadRes.error.message }, 500);

    const threadId = threadRes.data?.id;
    if (!threadId) return json({ ok: true, thread_id: null, messages: [] }, 200);

    // messages
    const msgRes = await admin
      .from("chat_messages")
      .select("id,sender_role,body,created_at,edited_at,deleted_at,delivered_at,read_by_client_at,reply_to_message_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (msgRes.error) return json({ error: msgRes.error.message }, 500);

    const msgs = (msgRes.data || []) as any[];
    const msgIds = msgs.map((m) => m.id);

    // attachments for those messages
    let attRows: any[] = [];
    if (msgIds.length) {
      const at = await admin
        .from("chat_attachments")
        .select("id,message_id,storage_bucket,storage_path,original_name,mime_type,size_bytes,created_at")
        .eq("thread_id", threadId)
        .in("message_id", msgIds);

      if (at.error) return json({ error: at.error.message }, 500);
      attRows = at.data || [];
    }

    // signed urls
    const byMsg = new Map<string, any[]>();
    await Promise.all(
      attRows.map(async (a) => {
        const signed = await admin.storage
          .from(a.storage_bucket)
          .createSignedUrl(a.storage_path, 60 * 10);

        const item = {
          id: a.id,
          attachment_id: a.id,
          storage_path: a.storage_path,
          original_name: a.original_name,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          created_at: a.created_at,
          signed_url: signed.data?.signedUrl || null,
        };

        const k = a.message_id as string;
        if (!byMsg.has(k)) byMsg.set(k, []);
        byMsg.get(k)!.push(item);
      }),
    );

    // attach to messages
    const out = msgs.map((m) => ({
      ...m,
      attachments: byMsg.get(m.id) || [],
    }));

    return json({ ok: true, thread_id: threadId, messages: out }, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
