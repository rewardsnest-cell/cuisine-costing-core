-- Pricing v2 — Schedule extensions: expiry + "all keywords" mode + run counter
ALTER TABLE public.pricing_v2_keyword_schedules
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_runs integer,
  ADD COLUMN IF NOT EXISTS run_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS use_all_keywords boolean NOT NULL DEFAULT false;

-- Allow keyword_ids to be empty when use_all_keywords = true
-- (existing default '{}' already permits this; nothing to change)

COMMENT ON COLUMN public.pricing_v2_keyword_schedules.expires_at IS 'Optional: schedule auto-disables after this timestamp.';
COMMENT ON COLUMN public.pricing_v2_keyword_schedules.max_runs IS 'Optional: schedule auto-disables after this many successful runs.';
COMMENT ON COLUMN public.pricing_v2_keyword_schedules.run_count IS 'Successful runs counter, incremented by the cron hook.';
COMMENT ON COLUMN public.pricing_v2_keyword_schedules.use_all_keywords IS 'When true, ignore keyword_ids and sweep every enabled keyword in the library.';