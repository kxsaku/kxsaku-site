// supabase/functions/admin-broadcast/index.ts
// Sends a broadcast message to all client chat threads
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";

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

type ReqBody = {
  content?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = (getEnv("ADMIN_EMAIL") || "").toLowerCase();

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "Missing Authorization bearer token" }, 401);

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify caller identity (must be ADMIN_EMAIL)
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr) return json(req, { error: `Auth error: ${userErr.message}` }, 401);

    const callerEmail = (userData.user?.email || "").toLowerCase();
    if (!callerEmail || callerEmail !== ADMIN_EMAIL) {
      return json(req, { error: "Forbidden: admin only" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const content = (body.content || "").trim();

    if (!content) {
      return json(req, { error: "Missing content" }, 400);
    }

    const nowIso = new Date().toISOString();
    // Prepend broadcast indicator to message
    const broadcastBody = `📢 BROADCAST\n\n${content}`;
    const preview = broadcastBody.slice(0, 140);

    // Get all chat threads
    const { data: threads, error: threadsErr } = await admin
      .from("chat_threads")
      .select("id, user_id");

    if (threadsErr) {
      return json(req, { error: "Failed to get threads", details: threadsErr.message }, 500);
    }

    if (!threads || threads.length === 0) {
      return json(req, { ok: true, sent_count: 0, message: "No client threads exist yet" }, 200);
    }

    let sentCount = 0;
    const errors: string[] = [];

    // Insert broadcast message to each thread
    for (const thread of threads) {
      const threadId = thread.id;

      // Insert message (using only standard columns)
      const msgInsert = await admin
        .from("chat_messages")
        .insert({
          thread_id: threadId,
          sender_role: "admin",
          body: broadcastBody,
          created_at: nowIso,
          delivered_at: nowIso,
        });

      if (msgInsert.error) {
        console.error(`Failed to insert broadcast to thread ${threadId}:`, msgInsert.error);
        errors.push(`Thread ${threadId}: ${msgInsert.error.message}`);
        continue;
      }

      // Update thread to show unread
      await admin
        .from("chat_threads")
        .update({
          last_admin_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: preview,
          last_sender_role: "admin",
          unread_for_client: true,
        })
        .eq("id", threadId);

      sentCount++;
    }

    return json(req, {
      ok: true,
      sent_count: sentCount,
      total_threads: threads.length,
      errors: errors.length > 0 ? errors : undefined,
    }, 200);

  } catch (err) {
    console.error("Error in admin-broadcast:", err);
    return json(req, { error: String((err as Error)?.message || err) }, 500);
  }
});
