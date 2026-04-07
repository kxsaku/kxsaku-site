// supabase/functions/_shared/rate-limit-db.ts
// Database-backed rate limiting that persists across Deno Deploy cold starts.
// Falls back gracefully: if the DB query fails, the request is allowed (logged warning).

import { getClientIP } from "./rate-limit.ts";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

/** Same tier configs as the in-memory version */
export const RATE_LIMITS = {
  admin:   { windowMs: 60000, maxRequests: 30  },
  auth:    { windowMs: 60000, maxRequests: 10  },
  public:  { windowMs: 60000, maxRequests: 20  },
  chat:    { windowMs: 60000, maxRequests: 60  },
  webhook: { windowMs: 60000, maxRequests: 100 },
} as const;

/**
 * Database-backed rate limit check.
 * Returns a 429 Response if over limit, or null if allowed.
 *
 * @param req       - incoming Request
 * @param sb        - Supabase client (service role)
 * @param config    - { keyPrefix, maxRequests, windowMs }
 * @param corsHeaders - CORS headers to include in 429 response
 */
export async function checkRateLimitDB(
  req: Request,
  sb: any,
  config: RateLimitConfig,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  try {
    const ip = getClientIP(req);
    const limiterKey = `${config.keyPrefix || "default"}:${ip}`;
    const windowStart = new Date(Date.now() - config.windowMs).toISOString();

    // Insert this request's entry
    const { error: insertErr } = await sb
      .from("rate_limit_entries")
      .insert({ limiter_key: limiterKey, ip_address: ip });

    if (insertErr) {
      console.warn("[rate-limit-db] insert failed, allowing request:", insertErr.message);
      return null; // graceful degradation
    }

    // Count entries in the current window
    const { count, error: countErr } = await sb
      .from("rate_limit_entries")
      .select("id", { count: "exact", head: true })
      .eq("limiter_key", limiterKey)
      .gte("created_at", windowStart);

    if (countErr) {
      console.warn("[rate-limit-db] count failed, allowing request:", countErr.message);
      return null; // graceful degradation
    }

    // Probabilistic cleanup (~1% of requests)
    if (Math.random() < 0.01) {
      sb.rpc("clean_rate_limit_entries").then(() => {}).catch((e: any) => {
        console.warn("[rate-limit-db] cleanup failed:", e?.message);
      });
    }

    if (count !== null && count > config.maxRequests) {
      const retryAfter = Math.ceil(config.windowMs / 1000);
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
        },
      );
    }

    return null; // allowed
  } catch (err) {
    console.warn("[rate-limit-db] unexpected error, allowing request:", (err as any)?.message || err);
    return null; // graceful degradation
  }
}
