ALTER TABLE public.competitor_quotes
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_competitor_quotes_archived
  ON public.competitor_quotes (archived);