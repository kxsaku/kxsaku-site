// supabase/functions/client-presence/index.ts
// Handles client presence tracking (heartbeat/offline)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";

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

type ReqBody = {
  action?: "heartbeat" | "offline";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

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
    const action = body.action || "heartbeat";

    const nowIso = new Date().toISOString();

    // Find or create thread for user
    const threadLookup = await admin
      .from("chat_threads")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (threadLookup.error) {
      return json(req, { error: "Failed to lookup thread", details: threadLookup.error.message }, 500);
    }

    let threadId = threadLookup.data?.id as string | undefined;

    if (!threadId) {
      // Create thread if none exists
      const insThread = await admin
        .from("chat_threads")
        .insert({
          user_id: userId,
          created_at: nowIso,
          is_online: action === "heartbeat",
          last_seen: nowIso,
        })
        .select("id")
        .single();

      if (insThread.error) {
        return json(req, { error: "Failed to create thread", details: insThread.error.message }, 500);
      }
      threadId = insThread.data.id;
    } else {
      // Update presence in existing thread
      const updateData: Record<string, unknown> = {
        last_seen: nowIso,
      };

      if (action === "heartbeat") {
        updateData.is_online = true;
      } else if (action === "offline") {
        updateData.is_online = false;
      }

      const upd = await admin
        .from("chat_threads")
        .update(updateData)
        .eq("id", threadId);

      if (upd.error) {
        return json(req, { error: "Failed to update presence", details: upd.error.message }, 500);
      }
    }

    return json(req, { ok: true, action, thread_id: threadId }, 200);
  } catch (e) {
    return json(req, { error: String((e as Error)?.message || e) }, 500);
  }
});
