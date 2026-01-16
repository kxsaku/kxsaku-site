// supabase/functions/_shared/cors.ts
// Shared CORS utility - restricts origins to allowed domains

/**
 * Get allowed origins from environment variables.
 * Reads from ALLOWED_ORIGINS (comma-separated) and SITE_URL.
 * Falls back to blocking all if not configured.
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Add SITE_URL if set
  const siteUrl = Deno.env.get("SITE_URL");
  if (siteUrl) {
    origins.push(siteUrl.replace(/\/+$/, ""));
  }

  // Add any additional allowed origins (comma-separated)
  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (allowedOrigins) {
    const parsed = allowedOrigins.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
    origins.push(...parsed);
  }

  // Always allow localhost for development
  origins.push("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173");

  return [...new Set(origins)]; // dedupe
}

/**
 * Check if the given origin is allowed.
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return allowed.some((o) => normalizedOrigin === o || normalizedOrigin.endsWith("." + new URL(o).hostname));
}

/**
 * Get CORS headers for a request.
 * Returns origin-specific headers if origin is allowed, otherwise restrictive headers.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowedOrigin = isOriginAllowed(origin) ? origin! : "null";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/**
 * Handle CORS preflight (OPTIONS) request.
 */
export function handleCorsPrefllight(req: Request): Response {
  return new Response("ok", { headers: getCorsHeaders(req) });
}

/**
 * Create a JSON response with proper CORS headers.
 */
export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}
