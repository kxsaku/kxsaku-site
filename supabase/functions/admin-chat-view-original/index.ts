// supabase/functions/admin-chat-view-original/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { ensureAdmin } from "../_shared/auth.ts";

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type ReqBody = {
  message_id?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for admin endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.admin, keyPrefix: "admin-chat-view-original" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    // Verify caller is authenticated and is an admin (database-backed check)
    const { sb: admin } = await ensureAdmin(req.headers.get("Authorization"));

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const message_id = (body.message_id || "").trim();
    if (!message_id) return json(req, { error: "Missing message_id" }, 400);

    const msgRes = await admin
      .from("chat_messages")
      .select(
        "id, sender_role, body, original_body, created_at, edited_at, deleted_at",
      )
      .eq("id", message_id)
      .maybeSingle();

    if (msgRes.error) return json(req, { error: msgRes.error.message }, 500);
    if (!msgRes.data) return json(req, { error: "Message not found" }, 404);

    const m = msgRes.data as any;

    return json(req, {
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
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
