// supabase/functions/admin-invite/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimitDB, RATE_LIMITS } from "../_shared/rate-limit-db.ts";
import { ensureAdmin } from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import { json } from "../_shared/response.ts";
import { getEnv } from "../_shared/env.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  try {
    const SITE_URL = getEnv("SITE_URL").replace(/\/+$/, "");

    // Verify caller is authenticated and is an admin (database-backed check)
    const { sb, email: adminEmail } = await ensureAdmin(req.headers.get("Authorization"));

    // DB-backed rate limiting (after client is available)
    const rateLimitResponse = await checkRateLimitDB(req, sb, { ...RATE_LIMITS.admin, keyPrefix: "admin-invite" }, getCorsHeaders(req));
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const inviteEmailRaw = String(body.email ?? "").trim();
    const inviteEmail = inviteEmailRaw.toLowerCase();

    if (!inviteEmail || !inviteEmail.includes("@")) {
      return json(req, { error: "Valid email required." }, 400);
    }

    // Send invite email with redirect back to your portal invite page
    const redirectTo = `${SITE_URL}/sns-portal-invite/index.html`;

    const { data: inviteData, error: inviteErr } =
      await sb.auth.admin.inviteUserByEmail(inviteEmail, {
        redirectTo,
        data: { role: "client" },
      });

    if (inviteErr) return json(req, { error: inviteErr.message }, 400);

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

    // Audit log the invite
    await logAuditEvent(sb, adminEmail, {
      action: "client_invite",
      targetTable: "auth.users",
      targetId: invitedUserId ?? undefined,
      details: { invited_email: inviteEmail },
    }, req);

    return json(req, { ok: true, invited_user_id: invitedUserId ?? null });
  } catch (e) {
    console.error(e);
    return json(req, { error: String(e?.message ?? e) }, 500);
  }
});
