// supabase/functions/admin-invite/index.ts
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SITE_URL = getEnv("SITE_URL").replace(/\/+$/, "");
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

    const body = await req.json().catch(() => ({}));
    const inviteEmailRaw = String(body.email ?? "").trim();
    const inviteEmail = inviteEmailRaw.toLowerCase();

    if (!inviteEmail || !inviteEmail.includes("@")) {
      return json({ error: "Valid email required." }, 400);
    }

    // Send invite email with redirect back to your portal invite page
    const redirectTo = `${SITE_URL}/sns-portal-invite/index.html`;

    const { data: inviteData, error: inviteErr } =
      await sb.auth.admin.inviteUserByEmail(inviteEmail, {
        redirectTo,
        data: { role: "client" },
      });

    if (inviteErr) return json({ error: inviteErr.message }, 400);

    // Pre-create billing row so webhook can match quickly after checkout
    // inviteData.user should contain the new auth user id
    const invitedUserId = inviteData?.user?.id;
    if (invitedUserId) {
      await sb.from("billing_subscriptions").upsert({
        user_id: invitedUserId,
        email: inviteEmail,
        status: "inactive",
      });

      // create minimal profile row (details completed during onboarding)
      await sb.from("client_profiles").upsert({
        user_id: invitedUserId,
        email: inviteEmail,
      });
    }

    return json({ ok: true, invited_user_id: invitedUserId ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
