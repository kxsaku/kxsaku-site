// supabase/functions/client-chat-mark-read/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type Body = {
  thread_id?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for chat endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.chat, keyPrefix: "client-chat-mark-read" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    // token comes from your client chat page calling this function
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const thread_id = (body.thread_id || "").trim();
    if (!thread_id) return json(req, { error: "Missing thread_id" }, 400);

    // Use service role client WITHOUT forcing Authorization header globally.
    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validate user identity from the JWT
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr) return json(req, { error: `Auth error: ${userErr.message}` }, 401);

    const uid = userData.user?.id;
    if (!uid) return json(req, { error: "Unauthorized" }, 401);

    // Validate the thread belongs to this user BEFORE updating
    const { data: threadRow, error: threadErr } = await admin
      .from("chat_threads")
      .select("user_id")
      .eq("id", thread_id)
      .maybeSingle();

    if (threadErr) return json(req, { error: threadErr.message }, 400);
    if (!threadRow) return json(req, { error: "Thread not found" }, 404);
    if (threadRow.user_id !== uid) return json(req, { error: "Forbidden" }, 403);

    // Mark all unread ADMIN messages as read by the client
    const nowIso = new Date().toISOString();

    const { error: updErr, count } = await admin
      .from("chat_messages")
      .update({ read_by_client_at: nowIso }, { count: "exact" })
      .eq("thread_id", thread_id)
      .eq("sender_role", "admin")
      .is("read_by_client_at", null);

    if (updErr) return json(req, { error: updErr.message }, 400);

    return json(req, { ok: true, updated: count ?? 0 }, 200);
  } catch (e) {
    return json(req,
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
