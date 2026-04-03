// supabase/functions/_shared/response.ts
// Shared JSON response helper with CORS

import { getCorsHeaders } from "./cors.ts";

/**
 * Create a JSON response with proper CORS headers.
 * Canonical signature: body ALWAYS second, status ALWAYS third.
 *
 * @param req - The incoming request (used for CORS origin matching)
 * @param body - The response body (will be JSON.stringify'd)
 * @param status - HTTP status code (default 200)
 * @returns Response with JSON body and CORS headers
 */
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}
