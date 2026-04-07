// supabase/functions/_shared/rate-limit.ts
// Simple IP-based rate limiting for Edge Functions

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (resets when function cold starts, but provides basic protection)
const ipStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60000) return; // Only cleanup every minute
  lastCleanup = now;
  for (const [key, entry] of ipStore) {
    if (entry.resetAt < now) {
      ipStore.delete(key);
    }
  }
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix?: string;  // Optional prefix for the key (e.g., endpoint name)
}

/**
 * Default configurations for different endpoint types
 */
export const RATE_LIMITS = {
  // Admin endpoints - stricter limits
  admin: { windowMs: 60000, maxRequests: 30 },    // 30 req/min

  // Auth-related endpoints - prevent brute force
  auth: { windowMs: 60000, maxRequests: 10 },     // 10 req/min

  // Public endpoints (contact form, etc.) - moderate limits
  public: { windowMs: 60000, maxRequests: 20 },   // 20 req/min

  // Chat endpoints - higher limits for real-time feel
  chat: { windowMs: 60000, maxRequests: 60 },     // 60 req/min

  // Webhook endpoints (Stripe, etc.) - higher limits
  webhook: { windowMs: 60000, maxRequests: 100 }, // 100 req/min
} as const;

/**
 * Get client IP from request headers.
 * Checks common proxy headers.
 */
export function getClientIP(req: Request): string {
  // Supabase/Deno Deploy sets these headers
  const cfIP = req.headers.get("cf-connecting-ip");
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const xRealIP = req.headers.get("x-real-ip");

  if (cfIP) return cfIP;
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  if (xRealIP) return xRealIP;

  return "unknown";
}

/**
 * Check if request should be rate limited.
 * Returns null if allowed, or a Response if rate limited.
 */
export function checkRateLimit(
  req: Request,
  config: RateLimitConfig,
  corsHeaders: Record<string, string>
): Response | null {
  cleanup();

  const ip = getClientIP(req);
  const key = `${config.keyPrefix || "default"}:${ip}`;
  const now = Date.now();

  let entry = ipStore.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    entry = { count: 1, resetAt: now + config.windowMs };
    ipStore.set(key, entry);
    return null; // Allowed
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        retryAfterSeconds: retryAfter,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  return null; // Allowed
}

/**
 * Add rate limit headers to response.
 */
export function addRateLimitHeaders(
  headers: Record<string, string>,
  req: Request,
  config: RateLimitConfig
): Record<string, string> {
  const ip = getClientIP(req);
  const key = `${config.keyPrefix || "default"}:${ip}`;
  const entry = ipStore.get(key);

  if (entry) {
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetAt = Math.ceil(entry.resetAt / 1000);
    return {
      ...headers,
      "X-RateLimit-Limit": String(config.maxRequests),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(resetAt),
    };
  }

  return headers;
}
