ALTER TABLE public.competitor_quotes
ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_competitor_quotes_outcome ON public.competitor_quotes(outcome);