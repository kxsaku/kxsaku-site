// supabase/functions/client-chat-send/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { encryptMessage, getEncryptionKey } from "../_shared/crypto.ts";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type AttachmentIn = {
  attachment_id?: string;
  storage_path?: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
};

type ReqBody = {
  body?: string;
  attachment_ids?: string[];
  attachments?: AttachmentIn[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for chat endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.chat, keyPrefix: "client-chat-send" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify user
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json(req, { error: "Missing Authorization Bearer token" }, 401);

    const authed = createClient(SB_URL, getEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData.user) return json(req, { error: "Auth error" }, 401);

    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const text = (body.body || "").trim();

    // Accept BOTH formats:
    // - attachment_ids: ["uuid", ...]
    // - attachments: [{ attachment_id: "uuid", ... }, ...]
    const attachmentIdsFromIds = Array.isArray(body.attachment_ids)
      ? body.attachment_ids.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const attachmentsArr = Array.isArray(body.attachments) ? body.attachments : [];
    const attachmentIdsFromObjects = attachmentsArr
      .map((a) => (a?.attachment_id || "").trim())
      .filter(Boolean);

    const attachment_ids = Array.from(new Set([...attachmentIdsFromIds, ...attachmentIdsFromObjects]));

    if (!text && attachment_ids.length === 0) {
      return json(req, { error: "Missing body" }, 400);
    }

    const nowIso = new Date().toISOString();

    // Ensure thread exists
    const threadLookup = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (threadLookup.error) {
      return json(req,
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
          user_id: userId,
          created_at: nowIso,
          last_client_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "client",
          unread_for_admin: true,
          unread_for_client: false,
        })
        .select("id")
        .single();

      if (insThread.error) {
        return json(req, { error: "Failed to create chat thread", details: insThread.error.message }, 500);
      }
      threadId = insThread.data.id;
    } else {
      const updThread = await admin
        .from("chat_threads")
        .update({
          last_client_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "client",
          unread_for_admin: true,
        })
        .eq("id", threadId);

      if (updThread.error) {
        return json(req, { error: "Failed to update chat thread", details: updThread.error.message }, 500);
      }
    }

    // Encrypt the message body before storing
    const encryptionKey = getEncryptionKey();
    const encryptedBody = text ? await encryptMessage(text, encryptionKey) : "";

    // Insert message
    const insMsg = await admin
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "client",
        body: encryptedBody,
        created_at: nowIso,
        delivered_at: nowIso,
      })
      .select("id, sender_role, body, created_at, edited_at, original_body, deleted_at, delivered_at")
      .single();

    if (insMsg.error) {
      return json(req,
        {
          error:
            "chat_messages not found (or insert failed). Create chat tables next before sending messages.",
          details: insMsg.error.message,
        },
        500,
      );
    }

    // LINK attachments to this message
    if (attachment_ids.length > 0) {
      const upd = await admin
        .from("chat_attachments")
        .update({ message_id: insMsg.data.id })
        .eq("thread_id", threadId)
        .in("id", attachment_ids)
        .is("message_id", null);

      if (upd.error) return json(req, { error: "Failed to link attachments", details: upd.error.message }, 500);
    }

    // Return original unencrypted text for immediate display
    const responseMessage = {
      ...insMsg.data,
      body: text,
    };
    return json(req, { ok: true, thread_id: threadId, message: responseMessage }, 200);
  } catch (e) {
    return json(req, { error: String((e as any)?.message || e) }, 500);
  }
});
