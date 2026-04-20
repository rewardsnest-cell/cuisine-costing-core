-- Add priority column to fred_series_map
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'fred_priority'
  ) THEN
    CREATE TYPE public.fred_priority AS ENUM ('primary', 'fallback');
  END IF;
END$$;

ALTER TABLE public.fred_series_map
  ADD COLUMN IF NOT EXISTS priority public.fred_priority NOT NULL DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS idx_fred_series_map_priority
  ON public.fred_series_map (priority, active);