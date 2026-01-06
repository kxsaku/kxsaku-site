// supabase/functions/admin-chat-send/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function resendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const RESEND_API_KEY = getEnv("RESEND_API_KEY");
  const RESEND_FROM = getEnv("RESEND_FROM");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text ?? undefined,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Resend error: ${r.status} ${t}`);
  }
}


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

type AttachmentIn = {
  attachment_id?: string;        // <- IMPORTANT
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes?: number | null;
};


type ReqBody = {
  user_id?: string;
  body?: string;
  attachments?: Array<{
    attachment_id?: string;
    storage_path?: string;
    original_name?: string;
    mime_type?: string;
    size_bytes?: number;
  }>;
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
    const textRaw = (body.body || "");
    const text = textRaw.trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!user_id) return json({ error: "Missing user_id" }, 400);
    if (!text && attachments.length === 0) {
      return json({ error: "Missing body (or attachments)" }, 400);
    }

    // used for thread preview
    const preview = text ? text.slice(0, 140) : "[Attachment]";



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
          last_admin_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: preview,
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
          last_admin_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: preview,
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
        body: text, // may be "" for attachment-only messages
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

// 2b) If attachments were uploaded (chat-attachment-upload-url), link them to this message
const attachmentIds = attachments
  .map((a) => a?.attachment_id)
  .filter((x): x is string => typeof x === "string" && x.length > 0);

if (attachmentIds.length > 0) {
  // Force-link the uploaded attachments to this message.
  // Do NOT filter by thread_id/message_id here — those fields may not be set yet.
  const upd = await admin
    .from("chat_attachments")
    .update({ message_id: m.id, thread_id: threadId })
    .in("id", attachmentIds);

  if (upd.error) {
    return json(
      { error: "Failed to link attachments to message", details: upd.error.message },
      500,
    );
  }
}



        // Email notify client (throttled per-thread, no message body)
    try {
      const APP_BASE_URL = getEnv("APP_BASE_URL");

      const { data: trow } = await admin
        .from("chat_threads")
        .select("id,client_email_muted,last_client_email_sent_at")
        .eq("id", threadId)
        .maybeSingle();

      const clientMuted = Boolean(trow?.client_email_muted);
      const lastClientEmailSentAt = trow?.last_client_email_sent_at
        ? Date.parse(trow.last_client_email_sent_at)
        : null;

      const nowMs = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;

      const allow = !clientMuted && (!lastClientEmailSentAt || nowMs - lastClientEmailSentAt >= TWO_HOURS);

      if (allow) {
        const { data: profile } = await admin
          .from("client_profiles")
          .select("email,contact_name")
          .eq("user_id", user_id)
          .maybeSingle();

        const to = (profile?.email || "").trim();
        if (to) {
          const name = profile?.contact_name || "there";
          const link = `${APP_BASE_URL}/sns-dashboard/`;

          await resendEmail({
            to,
            subject: "SNS: You have a new message",
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.4;">
                <h2 style="margin:0 0 10px 0;">You have a new message</h2>
                <p style="margin:0 0 12px 0;">Hi ${name},</p>
                <p style="margin:0 0 12px 0;">You have a new message from Saku Network Solutions.</p>
                <p style="margin:0 0 12px 0;"><a href="${link}">Log in to your client dashboard to view it.</a></p>
              </div>
            `,
            text: `Hi ${name},\n\nYou have a new message from Saku Network Solutions.\nLog in to view it: ${link}`,
          });

          await admin
            .from("chat_threads")
            .update({ last_client_email_sent_at: nowIso })
            .eq("id", threadId);
        }
      }
    } catch (_) {
      // Do not fail message send if email fails
    }


// Build attachment payload (signed URLs) for immediate rendering in admin UI
let outAttachments: any[] = [];

if (attachmentIds.length > 0) {
  const { data: atts, error: attErr } = await admin
    .from("chat_attachments")
    .select("id, storage_bucket, storage_path, mime_type, original_name, size_bytes")
    .eq("message_id", m.id);


  if (attErr) {
    return json(
      { error: "Failed to load linked attachments", details: attErr.message },
      500,
    );
  }

  for (const a of atts || []) {
    const bucket = (a as any).storage_bucket || "chat-attachments";
    const path = (a as any).storage_path as string;
    let signed_url: string | null = null;

    if (path) {
      const signed = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (!signed.error) signed_url = signed.data?.signedUrl || null;
    }

    outAttachments.push({
      id: a.id,
      storage_path: a.storage_path,
      mime_type: a.mime_type,
      file_name: (a as any).original_name,
      size_bytes: a.size_bytes ?? null,
      url: signed_url,
      signed_url,
    });
  }
}

  return json({
    ok: true,
    thread_id: threadId,
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
      attachments: outAttachments,
    },
  });
  } catch (err) {
    console.error("Error in admin-chat-send:", err);
    return json({ error: "Internal server error" }, 500);
  }
});