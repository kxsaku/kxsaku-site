// supabase/functions/migrate-encrypt-messages/index.ts
// ONE-TIME migration function to encrypt existing chat messages
// Run this once after deploying the encryption updates, then delete this function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/auth.ts";
import { encryptMessage, getEncryptionKey } from "../_shared/crypto.ts";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    // Admin only - this is a sensitive migration operation
    await ensureAdmin(req.headers.get("Authorization"));

    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const encryptionKey = getEncryptionKey();

    // Get all messages that are NOT already encrypted (don't start with "enc:")
    const { data: messages, error: fetchErr } = await admin
      .from("chat_messages")
      .select("id, body, original_body")
      .not("body", "like", "enc:%");

    if (fetchErr) {
      return json(req, { error: `Failed to fetch messages: ${fetchErr.message}` }, 500);
    }

    if (!messages || messages.length === 0) {
      return json(req, {
        ok: true,
        message: "No unencrypted messages found. Migration complete or already done.",
        migrated_count: 0
      }, 200);
    }

    let migratedCount = 0;
    const errors: string[] = [];

    for (const msg of messages) {
      try {
        const updateData: { body?: string; original_body?: string } = {};

        // Encrypt body if it exists and isn't empty
        if (msg.body && msg.body.trim()) {
          updateData.body = await encryptMessage(msg.body, encryptionKey);
        }

        // Encrypt original_body if it exists
        if (msg.original_body && msg.original_body.trim()) {
          updateData.original_body = await encryptMessage(msg.original_body, encryptionKey);
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateErr } = await admin
            .from("chat_messages")
            .update(updateData)
            .eq("id", msg.id);

          if (updateErr) {
            errors.push(`Message ${msg.id}: ${updateErr.message}`);
            continue;
          }
        }

        migratedCount++;
      } catch (e) {
        errors.push(`Message ${msg.id}: ${(e as Error).message}`);
      }
    }

    return json(req, {
      ok: true,
      message: `Migration complete. Encrypted ${migratedCount} of ${messages.length} messages.`,
      migrated_count: migratedCount,
      total_found: messages.length,
      errors: errors.length > 0 ? errors : undefined,
    }, 200);

  } catch (e) {
    console.error("Migration error:", e);
    return json(req, { error: (e as Error)?.message || String(e) }, 500);
  }
});
