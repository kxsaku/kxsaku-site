// supabase/functions/admin-chat-history/index.ts
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
  user_id?: string;
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
    const targetUserId = (body.user_id || "").trim();
    if (!targetUserId) return json({ error: "Missing user_id" }, 400);

    // Find the client's thread
    const th = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (th.error) return json({ error: th.error.message }, 500);

    const threadId = th.data?.id;
    if (!threadId) {
      return json({ ok: true, thread_id: null, messages: [] }, 200);
    }

    // Pull messages
    const msgRes = await admin
      .from("chat_messages")
      .select(
        "id,sender_role,body,original_body,created_at,edited_at,deleted_at,delivered_at,read_by_client_at,reply_to_message_id"
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });



    if (msgRes.error) return json({ error: msgRes.error.message }, 500);

    const msgs = (msgRes.data || []) as any[];
    const msgIds = msgs.map((m) => m.id);

    // Pull attachments for these messages
    let attRows: any[] = [];
    if (msgIds.length) {
      // Try the most complete schema first
      let at = await admin
        .from("chat_attachments")
        .select(
          "id,message_id,storage_bucket,storage_path,mime_type,size_bytes,created_at,uploaded_at,file_name,original_name"
        )
        .in("message_id", msgIds);

      // Fallback: no uploaded_at
      if (at.error && String(at.error.message).toLowerCase().includes("uploaded_at")) {
        at = await admin
          .from("chat_attachments")
          .select(
            "id,message_id,storage_bucket,storage_path,mime_type,size_bytes,created_at,file_name,original_name"
          )
          .in("message_id", msgIds);
      }

      // Fallback: no file_name
      if (at.error && String(at.error.message).toLowerCase().includes("file_name")) {
        at = await admin
          .from("chat_attachments")
          .select(
            "id,message_id,storage_bucket,storage_path,mime_type,size_bytes,created_at,uploaded_at,original_name"
          )
          .in("message_id", msgIds);

        if (at.error && String(at.error.message).toLowerCase().includes("uploaded_at")) {
          at = await admin
            .from("chat_attachments")
            .select(
              "id,message_id,storage_bucket,storage_path,mime_type,size_bytes,created_at,original_name"
            )
            .in("message_id", msgIds);
        }
      }

      // Fallback: no original_name
      if (at.error && String(at.error.message).toLowerCase().includes("original_name")) {
        at = await admin
          .from("chat_attachments")
          .select(
            "id,message_id,storage_bucket,storage_path,mime_type,size_bytes,created_at,uploaded_at,file_name"
          )
          .in("message_id", msgIds);

        if (at.error && String(at.error.message).toLowerCase().includes("uploaded_at")) {
          at = await admin
            .from("chat_attachments")
            .select(
              "id,message_id,storage_bucket,storage_path,mime_type,size_bytes,created_at,file_name"
            )
            .in("message_id", msgIds);
        }
      }

      if (at.error) return json({ error: at.error.message }, 500);
      attRows = at.data || [];
    }



    // Create signed URLs (10 minutes)
    const signedMap = new Map<string, any[]>();
    await Promise.all(
      attRows.map(async (a) => {
        const bucket = (a.storage_bucket || "chat-attachments") as string;
        const path = (a.storage_path || "") as string;

        // If a row is malformed, don't break the entire chat history response
        if (!path) return;

        const signed = await admin.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 10);

        const signedUrl = signed.data?.signedUrl || null;

        const item = {
          id: a.id,
          attachment_id: a.id,
          storage_bucket: bucket,
          storage_path: path,

          // UI compatibility: your DB uses original_name, but some UI expects file_name
          original_name: a.original_name ?? a.file_name ?? null,
          file_name: a.file_name ?? a.original_name ?? null,

          mime_type: a.mime_type,
          size_bytes: a.size_bytes,

          signed_url: signedUrl,
          url: signedUrl,
        };


        const key = a.message_id;
        const arr = signedMap.get(key) || [];
        arr.push(item);
        signedMap.set(key, arr);
      })
    );


    const messages = msgs.map((m) => ({
      id: m.id,
      sender_role: m.sender_role,
      body: m.deleted_at ? "Deleted Message" : m.body,
      created_at: m.created_at,
      edited: !!m.edited_at,
      deleted: !!m.deleted_at,
      delivered_at: m.delivered_at || null,
      read_by_client_at: m.read_by_client_at || null,
      reply_to_message_id: m.reply_to_message_id || null,
      original_body: m.original_body || null, // admin-only use
      attachments: signedMap.get(String(m.id)) || [],
    }));

    // Clear admin unread when opening this chat
    await admin
      .from("chat_threads")
      .update({ unread_for_admin: false })
      .eq("id", threadId);

    return json({ ok: true, thread_id: threadId, messages }, 200);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
