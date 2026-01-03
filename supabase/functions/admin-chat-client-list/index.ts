// supabase/functions/admin-chat-client-list/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
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
  has_unread: boolean | null;
  is_online: boolean | null;
  last_seen: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = getEnv("ADMIN_EMAIL").toLowerCase();

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Authorization bearer token." }, 401);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    // Verify caller is authenticated and is the admin email
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid session." }, 401);

    const callerEmail = (userData.user.email ?? "").toLowerCase();
    if (callerEmail !== ADMIN_EMAIL) return json({ error: "Forbidden." }, 403);

    // Pull clients from your existing profile table
    const { data: profiles, error: pErr } = await sb
      .from("client_profiles")
      .select("user_id,email,contact_name,business_name,phone");

    if (pErr) return json({ error: `client_profiles query failed: ${pErr.message}` }, 500);

    const clientRows: ClientRow[] = Array.isArray(profiles) ? (profiles as ClientRow[]) : [];

    // Optional: merge chat thread metadata IF the table exists.
    // If it doesn't exist yet, we silently default fields so the UI still works.
    let threadRows: ThreadRow[] = [];
    const { data: threads, error: tErr } = await sb
      .from("chat_threads")
      .select("user_id,last_message_at,has_unread,is_online,last_seen");

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
        has_unread: Boolean(t?.has_unread ?? false),
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

    return json({ clients });
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
