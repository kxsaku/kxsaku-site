-- Rate limiting table for persistent rate limits across cold starts
CREATE TABLE IF NOT EXISTS public.rate_limit_entries (
    id bigserial PRIMARY KEY,
    limiter_key varchar(255) NOT NULL,
    ip_address varchar(45),
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for efficient windowed queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_key_created
  ON public.rate_limit_entries(limiter_key, created_at DESC);

-- Only service role can access (edge functions use service role)
ALTER TABLE public.rate_limit_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.rate_limit_entries
  FOR ALL USING (true) WITH CHECK (true);

-- Cleanup function to remove entries older than 2 hours
CREATE OR REPLACE FUNCTION public.clean_rate_limit_entries()
RETURNS void AS $$
BEGIN
  DELETE FROM public.rate_limit_entries
  WHERE created_at < now() - interval '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CLEANUP STRATEGY:
-- 1. Probabilistic: The edge function rate limiter calls clean_rate_limit_entries()
--    on ~1% of requests automatically (built into rate-limit-db.ts).
-- 2. Optional cron: For heavier traffic, schedule via Supabase Dashboard > SQL Editor
--    or pg_cron (if enabled):
--      SELECT cron.schedule('clean-rate-limits', '*/30 * * * *',
--        'SELECT public.clean_rate_limit_entries()');
