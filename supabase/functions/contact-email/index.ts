// supabase/functions/contact-email/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimitDB, RATE_LIMITS } from "../_shared/rate-limit-db.ts";
import { json } from "../_shared/response.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";

const sbRL = createClient(
  Deno.env.get("SB_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for public endpoints (contact form is more susceptible to abuse)
  const rateLimitResponse = await checkRateLimitDB(req, sbRL, { ...RATE_LIMITS.public, keyPrefix: "contact-email" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const TO_EMAIL = Deno.env.get("CONTACT_TO_EMAIL");
    const FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL");

    if (!RESEND_API_KEY || !TO_EMAIL || !FROM_EMAIL) {
      return json(req, {
        error: "Missing env var(s)",
        missing: {
          RESEND_API_KEY: !RESEND_API_KEY,
          CONTACT_TO_EMAIL: !TO_EMAIL,
          CONTACT_FROM_EMAIL: !FROM_EMAIL,
        },
      }, 500);
    }

    const { subject, message, page, userAgent, captcha_token } = await req.json();

    // Verify Turnstile CAPTCHA token before sending email
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    if (!await verifyTurnstile(captcha_token || "", clientIp)) {
      return json(req, { error: "CAPTCHA verification failed. Please try again." }, 403);
    }

    if (!subject || !message) return json(req, { error: "Missing subject/message" }, 400);

    // Server-side length validation
    if (typeof subject === "string" && subject.length > 200) {
      return json(req, { error: "Subject too long (max 200 characters)" }, 400);
    }
    if (typeof message === "string" && message.length > 5000) {
      return json(req, { error: "Message too long (max 5000 characters)" }, 400);
    }
    if (typeof page === "string" && page.length > 500) {
      return json(req, { error: "Page field too long (max 500 characters)" }, 400);
    }

    const emailText =
`SNS Website Contact Form

Subject: ${subject}

Message:
${message}

Meta:
- Page: ${page || "n/a"}
- UA: ${userAgent || "n/a"}
- Time: ${new Date().toISOString()}
`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAIL,
        subject: `[SNS] ${subject}`,
        text: emailText,
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return json(req, {
        error: "Email provider error",
        status: r.status,
        details: raw,
      }, 500);
    }

    return json(req, { ok: true, provider: raw });
  } catch (e) {
    return json(req, { error: String((e as any)?.message || e) }, 500);
  }
});
