// supabase/functions/inquiry-otp/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeUSPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  let d = digits;
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  return `+1${d}`;
}

async function twilioVerifySend(phoneE164: string) {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const serviceSid = requireEnv("TWILIO_VERIFY_SERVICE_SID");

  const url =
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;

  const body = new URLSearchParams();
  body.set("To", phoneE164);
  body.set("Channel", "sms");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Failed to send OTP");
  return data;
}

async function twilioVerifyCheck(phoneE164: string, code: string) {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const serviceSid = requireEnv("TWILIO_VERIFY_SERVICE_SID");

  const url =
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`;

  const body = new URLSearchParams();
  body.set("To", phoneE164);
  body.set("Code", code);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Failed to verify OTP");
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for auth-related endpoints (OTP is sensitive to abuse)
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.auth, keyPrefix: "inquiry-otp" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { action, phone, code, payload } = await req.json();

    const phoneE164 = normalizeUSPhone(phone || "");
    if (!phoneE164) return json(req, { ok: false, error: "Invalid phone number." }, 400);

    if (action === "send") {
      await twilioVerifySend(phoneE164);
      return json(req, { ok: true });
    }

    if (action === "check") {
      if (!code || typeof code !== "string") {
        return json(req, { ok: false, error: "Missing code." }, 400);
      }

      const check = await twilioVerifyCheck(phoneE164, code);
      if (check?.status !== "approved") {
        return json(req, { ok: false, error: "Invalid code." }, 400);
      }

      // Insert into Supabase using SERVICE ROLE (bypasses RLS)
      const supabaseUrl = requireEnv("PROJECT_SUPABASE_URL");
      const serviceRole = requireEnv("PROJECT_SERVICE_ROLE_KEY");
      const sb = createClient(supabaseUrl, serviceRole);

      // payload should be the inquiry fields
      const { error } = await sb.from("inquiries").insert({
        ...payload,
        phone: phoneE164,
        phone_verified: true,
      });

      if (error) throw error;
      return json(req, { ok: true });
    }

    return json(req, { ok: false, error: "Invalid action." }, 400);
  } catch (e) {
    return json(req, { ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
