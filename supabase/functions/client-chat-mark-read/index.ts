// supabase/functions/client-chat-mark-read/index.ts
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
  thread_id?: string;
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
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const threadId = (body.thread_id || "").trim();
    if (!threadId) return json({ error: "Missing thread_id" }, 400);

    // Validate: this thread belongs to the calling client
    const t = await sb
      .from("chat_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .single();

    if (t.error || !t.data) return json({ error: "Thread not found" }, 404);
    if (t.data.user_id !== userId) return json({ error: "Forbidden" }, 403);

    const readAt = new Date().toISOString();

    // Mark ALL admin->client messages as read (only the ones not yet read)
    const upd = await sb
      .from("chat_messages")
      .update({ read_by_client_at: readAt })
      .eq("thread_id", threadId)
      .eq("sender_role", "admin")
      .is("read_by_client_at", null);

    if (upd.error) return json({ error: upd.error.message }, 400);

    return json({ ok: true, thread_id: threadId, read_at: readAt }, 200);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
