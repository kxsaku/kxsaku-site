// supabase/functions/admin-chat-client-list/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { ensureAdmin } from "../_shared/auth.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type ClientRow = {
  user_id: string;
  email: string | null;
  contact_name: string | null;
  business_name: string | null;
  phone: string | null;
};

type ThreadRow = {
  user_id: string;
  last_message_at: string | null;
  unread_for_admin: boolean | null;
  // optional presence fields (if you add them later)
  is_online?: boolean | null;
  last_seen?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for admin endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.admin, keyPrefix: "admin-chat-client-list" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Verify caller is authenticated and is an admin (database-backed check)
    const { sb } = await ensureAdmin(req.headers.get("Authorization"));

    // Pull clients from your existing profile table
    const { data: profiles, error: pErr } = await sb
      .from("client_profiles")
      .select("user_id,email,contact_name,business_name,phone");

    if (pErr) return json(req, { error: `client_profiles query failed: ${pErr.message}` }, 500);

    const clientRows: ClientRow[] = Array.isArray(profiles) ? (profiles as ClientRow[]) : [];

    // Optional: merge chat thread metadata IF the table exists.
    // IMPORTANT: keep column names aligned with your chat_threads schema.
    // Current schema used by other functions: unread_for_admin / unread_for_client.
    let threadRows: ThreadRow[] = [];

    // Try the most complete select first; if your table doesn't have is_online/last_seen yet,
    // we fall back to the minimal, required fields.
    let threads: any = null;
    let tErr: any = null;

    ({ data: threads, error: tErr } = await sb
      .from("chat_threads")
      .select("user_id,last_message_at,unread_for_admin,is_online,last_seen"));

    if (tErr) {
      ({ data: threads, error: tErr } = await sb
        .from("chat_threads")
        .select("user_id,last_message_at,unread_for_admin"));
    }

    if (!tErr && Array.isArray(threads)) {
      threadRows = threads as ThreadRow[];
    }


    const threadByUser = new Map<string, ThreadRow>();
    for (const t of threadRows) threadByUser.set(t.user_id, t);

    const clients = clientRows.map((c) => {
      const t = threadByUser.get(c.user_id);
      return {
        user_id: c.user_id,
        email: c.email,
        full_name: c.contact_name,
        business_name: c.business_name,
        phone: c.phone,
        last_message_at: t?.last_message_at ?? null,
        has_unread: Boolean((t as any)?.unread_for_admin ?? false),
        is_online: Boolean(t?.is_online ?? false),
        last_seen: t?.last_seen ?? null,
      };
    });

    // Sort: newest message first (nulls last), then name/email
    clients.sort((a, b) => {
      const at = a.last_message_at ? Date.parse(a.last_message_at) : -Infinity;
      const bt = b.last_message_at ? Date.parse(b.last_message_at) : -Infinity;

      if (at !== bt) return bt - at;

      const an = (a.full_name || a.email || "").toLowerCase();
      const bn = (b.full_name || b.email || "").toLowerCase();
      return an.localeCompare(bn);
    });

    return json(req, { clients });
  } catch (e) {
    return json(req, { error: (e as Error).message ?? String(e) }, 500);
  }
});
