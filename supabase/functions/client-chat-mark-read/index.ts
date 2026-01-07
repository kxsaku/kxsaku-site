// supabase/functions/client-chat-mark-read/index.ts
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

type Body = {
  thread_id?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    // token comes from your client chat page calling this function
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const thread_id = (body.thread_id || "").trim();
    if (!thread_id) return json({ error: "Missing thread_id" }, 400);

    // IMPORTANT:
    // Use service role client WITHOUT forcing Authorization header globally.
    // We only pass the user token to auth.getUser(token) for identity validation.
    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validate user identity from the JWT
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);

    const uid = userData.user?.id;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    // Validate the thread belongs to this user BEFORE updating
    const { data: threadRow, error: threadErr } = await admin
      .from("chat_threads")
      .select("user_id")
      .eq("id", thread_id)
      .maybeSingle();

    if (threadErr) return json({ error: threadErr.message }, 400);
    if (!threadRow) return json({ error: "Thread not found" }, 404);
    if (threadRow.user_id !== uid) return json({ error: "Forbidden" }, 403);

    // Mark all unread ADMIN messages as read by the client
    const nowIso = new Date().toISOString();

    const { error: updErr, count } = await admin
      .from("chat_messages")
      .update({ read_by_client_at: nowIso }, { count: "exact" })
      .eq("thread_id", thread_id)
      .eq("sender_role", "admin")
      .is("read_by_client_at", null);

    if (updErr) return json({ error: updErr.message }, 400);

    return json({ ok: true, updated: count ?? 0 }, 200);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
