ALTER TABLE public.pricing_v2_errors
  ADD COLUMN IF NOT EXISTS counts_in integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS counts_out integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warnings_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS executed_sql text;