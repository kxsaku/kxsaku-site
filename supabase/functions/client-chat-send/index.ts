// supabase/functions/client-chat-send/index.ts
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

type ReqBody = {
  body?: string;
  reply_to_message_id?: string | null;

  // attachments passed from UI after upload
  attachments?: Array<{
    storage_path: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
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
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Identify caller
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr) return json({ error: `Auth error: ${userErr.message}` }, 401);
    const uid = userData.user?.id;
    if (!uid) return json({ error: "No user found" }, 401);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const text = (body.body || "").trim();
    const replyTo = (body.reply_to_message_id || null) as string | null;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];


    if (!text) return json({ error: "Missing body" }, 400);

    const nowIso = new Date().toISOString();

    // Ensure thread exists (one per user)
    const thread = await sb
      .from("chat_threads")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();

    if (thread.error) return json({ error: thread.error.message }, 500);

    let threadId = thread.data?.id as string | undefined;

    if (!threadId) {
      const ins = await sb
        .from("chat_threads")
        .insert({
          user_id: uid,
          last_client_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "client",
          unread_for_admin: true,
          unread_for_client: false,
        })
        .select("id")
        .single();

      if (ins.error) return json({ error: ins.error.message }, 500);
      threadId = ins.data.id;
    } else {
      // Update thread summary + unread flags
      const upd = await sb
        .from("chat_threads")
        .update({
          last_client_msg_at: nowIso,
          last_message_at: nowIso,
          last_message_preview: text.slice(0, 140),
          last_sender_role: "client",
          unread_for_admin: true,
        })
        .eq("id", threadId);

      if (upd.error) return json({ error: upd.error.message }, 500);
    }

    // Insert message
    const insMsg = await sb
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "client",
        body: text,
        reply_to_message_id: replyTo,
        created_at: nowIso,
        delivered_at: nowIso,
      })
      .select("id, sender_role, body, created_at, edited_at, deleted_at, delivered_at")
      .single();

    if (insMsg.error) return json({ error: insMsg.error.message }, 500);

    // If attachments were provided, link them to this message
if (attachments.length > 0) {
  const rows = attachments
    .filter(a => a?.storage_path && a?.original_name && a?.mime_type)
    .map(a => ({
      thread_id: threadId,
      message_id: insMsg.data.id,
      uploader_user_id: uid,
      uploader_role: "client",
      storage_bucket: "chat-attachments",
      storage_path: a.storage_path,
      original_name: a.original_name,
      mime_type: a.mime_type,
      size_bytes: Number(a.size_bytes || 0),
    }));

  if (rows.length > 0) {
    const insAtt = await sb.from("chat_attachments").insert(rows);
    if (insAtt.error) return json({ error: insAtt.error.message }, 500);
  }
}


        // Email notify admin (throttled per-thread)
    try {
      const ADMIN_EMAIL = getEnv("ADMIN_EMAIL").toLowerCase();
      const APP_BASE_URL = getEnv("APP_BASE_URL");

      const { data: trow } = await sb
        .from("chat_threads")
        .select("id,last_client_msg_at,admin_email_muted,last_admin_email_sent_at")
        .eq("id", threadId)
        .maybeSingle();

      const adminMuted = Boolean(trow?.admin_email_muted);
      const lastClientMsgAt = trow?.last_client_msg_at ? Date.parse(trow.last_client_msg_at) : null;

      // We want: send email only if the previous client message was >= 2 hours ago (or none)
      // Because we already set last_client_msg_at = nowIso above, we need the "previous" timestamp:
      // If the table previously had a value, it was overwritten by nowIso only in our update statement.
      // So: fetch previous BEFORE overwriting is ideal, but we keep it simple by using last_admin_email_sent_at gate.
      // Rule: if last_admin_email_sent_at is null OR now - last_admin_email_sent_at >= 2h → allow.
      const lastAdminEmailSentAt = trow?.last_admin_email_sent_at
        ? Date.parse(trow.last_admin_email_sent_at)
        : null;

      const nowMs = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;

      const allow = !adminMuted && (!lastAdminEmailSentAt || nowMs - lastAdminEmailSentAt >= TWO_HOURS);

      if (allow) {
        const { data: profile } = await sb
          .from("client_profiles")
          .select("contact_name,business_name,phone,email")
          .eq("user_id", uid)
          .maybeSingle();

        const name = profile?.contact_name || "Client";
        const biz = profile?.business_name || "—";
        const phone = profile?.phone || "—";
        const clientEmail = profile?.email || "—";

        const ts = new Date(nowIso).toLocaleString("en-US", { hour12: true });
        const link = `${APP_BASE_URL}/sns-client-chat/?user_id=${encodeURIComponent(uid)}`;

        const subject = `SNS Chat: New message from ${name}`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.4;">
            <h2 style="margin:0 0 10px 0;">New client message</h2>
            <p style="margin:0 0 8px 0;"><b>Name:</b> ${name}</p>
            <p style="margin:0 0 8px 0;"><b>Business:</b> ${biz}</p>
            <p style="margin:0 0 8px 0;"><b>Phone:</b> ${phone}</p>
            <p style="margin:0 0 8px 0;"><b>Email:</b> ${clientEmail}</p>
            <p style="margin:0 0 8px 0;"><b>Time:</b> ${ts}</p>
            <p style="margin:10px 0 8px 0;"><b>Message:</b></p>
            <div style="padding:10px; border:1px solid #ddd; border-radius:8px; white-space:pre-wrap;">${text}</div>
            <p style="margin:12px 0 0 0;"><a href="${link}">Open this chat</a></p>
          </div>
        `;

        await resendEmail({ to: ADMIN_EMAIL, subject, html, text: `${name} (${biz}, ${phone}) @ ${ts}\n\n${text}\n\n${link}` });

        await sb
          .from("chat_threads")
          .update({ last_admin_email_sent_at: nowIso })
          .eq("id", threadId);
      }
    } catch (_) {
      // Do not fail message send if email fails
    }


    // Thread trigger will keep last_message_* consistent, but we already set it.
    return json({
      ok: true,
      thread_id: threadId,
      message: {
        id: insMsg.data.id,
        sender_role: insMsg.data.sender_role,
        body: insMsg.data.body,
        created_at: insMsg.data.created_at,
        edited: !!insMsg.data.edited_at,
        deleted: !!insMsg.data.deleted_at,
        delivered_at: insMsg.data.delivered_at || null,
      },
    });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
