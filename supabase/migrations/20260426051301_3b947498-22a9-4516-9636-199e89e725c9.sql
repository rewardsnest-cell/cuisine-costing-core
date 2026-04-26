ALTER TABLE public.pricing_v2_keyword_schedules
  ADD COLUMN IF NOT EXISTS keyword_filter_mode text NOT NULL DEFAULT 'include';

ALTER TABLE public.pricing_v2_keyword_schedules
  DROP CONSTRAINT IF EXISTS pricing_v2_keyword_schedules_filter_mode_chk;

ALTER TABLE public.pricing_v2_keyword_schedules
  ADD CONSTRAINT pricing_v2_keyword_schedules_filter_mode_chk
  CHECK (keyword_filter_mode IN ('include','exclude'));