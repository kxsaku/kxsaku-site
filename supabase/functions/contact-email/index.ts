// supabase/functions/contact-email/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const TO_EMAIL = Deno.env.get("CONTACT_TO_EMAIL");
    const FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL"); // verified sender in Resend

    if (!RESEND_API_KEY || !TO_EMAIL || !FROM_EMAIL) {
      return json(500, {
        error: "Missing env var(s)",
        missing: {
          RESEND_API_KEY: !RESEND_API_KEY,
          CONTACT_TO_EMAIL: !TO_EMAIL,
          CONTACT_FROM_EMAIL: !FROM_EMAIL,
        },
      });
    }

    const { subject, message, page, userAgent } = await req.json();
    if (!subject || !message) return json(400, { error: "Missing subject/message" });

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
      return json(500, {
        error: "Email provider error",
        status: r.status,
        details: raw,
      });
    }

    return json(200, { ok: true, provider: raw });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
});
