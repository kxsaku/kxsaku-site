// supabase/functions/client-chat-edit/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type ReqBody = {
  message_id?: string;
  body?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for chat endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.chat, keyPrefix: "client-chat-edit" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "Missing Authorization bearer token" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Identify caller
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr) return json(req, { error: `Auth error: ${userErr.message}` }, 401);
    const uid = userData.user?.id;
    if (!uid) return json(req, { error: "No user found" }, 401);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const message_id = (body.message_id || "").trim();
    const nextText = (body.body || "").trim();

    if (!message_id) return json(req, { error: "Missing message_id" }, 400);
    if (!nextText) return json(req, { error: "Missing body" }, 400);

    // Load message and verify ownership through thread.user_id
    const msgRes = await sb
      .from("chat_messages")
      .select("id, thread_id, sender_role, body, deleted_at, edited_at, original_body")
      .eq("id", message_id)
      .maybeSingle();

    if (msgRes.error) return json(req, { error: msgRes.error.message }, 500);
    const msg = msgRes.data as any;
    if (!msg) return json(req, { error: "Message not found" }, 404);

    if (msg.sender_role !== "client") return json(req, { error: "Only client messages can be edited" }, 403);
    if (msg.deleted_at) return json(req, { error: "Deleted messages cannot be edited" }, 409);

    const threadRes = await sb
      .from("chat_threads")
      .select("user_id")
      .eq("id", msg.thread_id)
      .maybeSingle();

    if (threadRes.error) return json(req, { error: threadRes.error.message }, 500);
    const thread = threadRes.data as any;
    if (!thread || thread.user_id !== uid) return json(req, { error: "Forbidden" }, 403);

    // Preserve original_body on first edit only
    const nowIso = new Date().toISOString();
    const originalBody = msg.original_body ?? msg.body;

    const upd = await sb
      .from("chat_messages")
      .update({
        body: nextText,
        edited_at: nowIso,
        original_body: originalBody,
      })
      .eq("id", message_id)
      .select("id, sender_role, body, created_at, edited_at, original_body, deleted_at, delivered_at")
      .single();

    if (upd.error) return json(req, { error: upd.error.message }, 500);

    return json(req, {
      ok: true,
      message: {
        id: upd.data.id,
        sender_role: upd.data.sender_role,
        body: upd.data.body,
        created_at: upd.data.created_at,
        edited: !!upd.data.edited_at,
        original_body: upd.data.original_body || null,
        deleted: !!upd.data.deleted_at,
        delivered_at: upd.data.delivered_at || null,
      },
    });
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
