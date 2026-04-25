
ALTER TABLE public.pricing_v2_runs
  ADD COLUMN IF NOT EXISTS params JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT;

ALTER TABLE public.pricing_v2_errors
  ADD COLUMN IF NOT EXISTS entity_name TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pricing_v2_errors_resolved
  ON public.pricing_v2_errors (resolved_at)
  WHERE resolved_at IS NULL;
