ALTER TABLE public.pricing_v2_keyword_schedules
  ADD COLUMN IF NOT EXISTS continuous_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_when_no_new_items boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS empty_runs_threshold integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS consecutive_empty_runs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS continuous_interval_seconds integer NOT NULL DEFAULT 60;