// supabase/functions/admin-chat-send/index.ts
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
  body?: string;
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
    const text = (body.body || "").trim();

    if (!user_id) return json({ error: "Missing user_id" }, 400);
    if (!text) return json({ error: "Missing body" }, 400);

    const nowIso = new Date().toISOString();

    // 1) Ensure thread exists (expected table: chat_threads)
    // If chat tables don't exist yet, fail gracefully with a clear warning.
    const threadLookup = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (threadLookup.error) {
      return json(
        {
          error:
            "chat_threads not found (or inaccessible). Create chat tables next before sending messages.",
          details: threadLookup.error.message,
        },
        500,
      );
    }

    let threadId = threadLookup.data?.id as string | undefined;

    if (!threadId) {
      const insThread = await admin
        .from("chat_threads")
        .insert({
          user_id,
          created_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "admin",
          // unread_for_client means: client has something they haven't read yet
          unread_for_client: true,
          unread_for_admin: false,
        })
        .select("id")
        .single();

      if (insThread.error) {
        return json(
          {
            error: "Failed to create chat thread",
            details: insThread.error.message,
          },
          500,
        );
      }
      threadId = insThread.data.id;
    } else {
      // Update thread summary
      const updThread = await admin
        .from("chat_threads")
        .update({
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "admin",
          unread_for_client: true,
        })
        .eq("id", threadId);

      if (updThread.error) {
        return json(
          {
            error: "Failed to update chat thread",
            details: updThread.error.message,
          },
          500,
        );
      }
    }

    // 2) Insert message (expected table: chat_messages)
    const insMsg = await admin
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "admin",
        body: text,
        created_at: nowIso,
        delivered_at: nowIso, // delivery receipt baseline
      })
      .select(
        "id, sender_role, body, created_at, edited_at, original_body, deleted_at, delivered_at, read_by_client_at",
      )
      .single();

    if (insMsg.error) {
      return json(
        {
          error:
            "chat_messages not found (or insert failed). Create chat tables next before sending messages.",
          details: insMsg.error.message,
        },
        500,
      );
    }

    const m = insMsg.data as any;

    return json({
      ok: true,
      message: {
        id: m.id,
        sender_role: m.sender_role,
        body: m.body,
        created_at: m.created_at,
        edited: !!m.edited_at,
        original_body: m.original_body || null,
        deleted: !!m.deleted_at,
        delivered_at: m.delivered_at || null,
        read_by_client_at: m.read_by_client_at || null,
      },
    });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
