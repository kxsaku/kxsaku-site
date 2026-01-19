// supabase/functions/_shared/auth.ts
// Shared authentication and authorization utilities

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Validates the JWT token and checks if the user is an admin.
 * Uses the user_profiles.is_admin database flag for authorization.
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns Object containing the service-role Supabase client, user email, and user ID
 * @throws Error if unauthorized or not an admin
 */
export async function ensureAdmin(authHeader: string | null): Promise<{
  sb: SupabaseClient;
  email: string;
  userId: string;
}> {
  if (!authHeader) throw new Error("Missing Authorization header.");

  const token = authHeader.replace("Bearer", "").trim();
  if (!token) throw new Error("Missing bearer token.");

  const SUPABASE_URL = getEnv("SB_URL");
  const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

  // Use anon client to validate the JWT
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);

  if (userErr || !userData?.user?.email) {
    throw new Error("Unauthorized: Invalid or expired session.");
  }

  const email = userData.user.email.toLowerCase();
  const userId = userData.user.id;

  // Use service role to check admin flag (bypasses RLS)
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: prof, error: profErr } = await sb
    .from("user_profiles")
    .select("email, is_admin")
    .eq("email", email)
    .maybeSingle();

  if (profErr) {
    console.error("Error checking admin status:", profErr);
    throw new Error("Failed to verify admin status.");
  }

  if (!prof?.is_admin) {
    throw new Error("Forbidden: Admin access required.");
  }

  return { sb, email, userId };
}

/**
 * Validates the JWT token and returns user info.
 * For non-admin authenticated endpoints.
 *
 * @param authHeader - The Authorization header value
 * @returns Object containing the service-role Supabase client, user email, and user ID
 * @throws Error if unauthorized
 */
export async function ensureAuthenticated(authHeader: string | null): Promise<{
  sb: SupabaseClient;
  email: string;
  userId: string;
}> {
  if (!authHeader) throw new Error("Missing Authorization header.");

  const token = authHeader.replace("Bearer", "").trim();
  if (!token) throw new Error("Missing bearer token.");

  const SUPABASE_URL = getEnv("SB_URL");
  const SUPABASE_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(token);

  if (userErr || !userData?.user) {
    throw new Error("Unauthorized: Invalid or expired session.");
  }

  const email = (userData.user.email ?? "").toLowerCase();
  const userId = userData.user.id;

  if (!email) {
    throw new Error("User email not found.");
  }

  return { sb, email, userId };
}
