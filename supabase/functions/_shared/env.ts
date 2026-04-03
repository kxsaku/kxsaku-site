// supabase/functions/_shared/env.ts
// Shared environment variable helper

/**
 * Get a required environment variable.
 * Throws if the variable is not set.
 *
 * @param name - The environment variable name
 * @returns The environment variable value
 * @throws Error if the variable is missing
 */
export function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
