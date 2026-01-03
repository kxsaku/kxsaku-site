// supabase/functions/admin-chat-view-original/index.ts
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
  message_id?: string;
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

    // Verify caller is admin
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);

    const callerEmail = (userData.user?.email || "").toLowerCase();
    if (!callerEmail || callerEmail !== ADMIN_EMAIL) {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const message_id = (body.message_id || "").trim();
    if (!message_id) return json({ error: "Missing message_id" }, 400);

    const msgRes = await admin
      .from("chat_messages")
      .select(
        "id, sender_role, body, original_body, created_at, edited_at, deleted_at",
      )
      .eq("id", message_id)
      .maybeSingle();

    if (msgRes.error) return json({ error: msgRes.error.message }, 500);
    if (!msgRes.data) return json({ error: "Message not found" }, 404);

    const m = msgRes.data as any;

    return json({
      ok: true,
      message: {
        id: m.id,
        sender_role: m.sender_role,
        body: m.deleted_at ? "Deleted Message" : m.body,
        original_body: m.original_body || m.body,
        created_at: m.created_at,
        edited: !!m.edited_at,
        deleted: !!m.deleted_at,
      },
    });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
