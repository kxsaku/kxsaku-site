// supabase/functions/contact-email/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for public endpoints (contact form is more susceptible to abuse)
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.public, keyPrefix: "contact-email" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const TO_EMAIL = Deno.env.get("CONTACT_TO_EMAIL");
    const FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL");

    if (!RESEND_API_KEY || !TO_EMAIL || !FROM_EMAIL) {
      return json(req, 500, {
        error: "Missing env var(s)",
        missing: {
          RESEND_API_KEY: !RESEND_API_KEY,
          CONTACT_TO_EMAIL: !TO_EMAIL,
          CONTACT_FROM_EMAIL: !FROM_EMAIL,
        },
      });
    }

    const { subject, message, page, userAgent } = await req.json();
    if (!subject || !message) return json(req, 400, { error: "Missing subject/message" });

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
      return json(req, 500, {
        error: "Email provider error",
        status: r.status,
        details: raw,
      });
    }

    return json(req, 200, { ok: true, provider: raw });
  } catch (e) {
    return json(req, 500, { error: String((e as any)?.message || e) });
  }
});
