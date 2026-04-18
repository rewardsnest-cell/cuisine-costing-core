ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS source_competitor_quote_id uuid
  REFERENCES public.competitor_quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipes_source_competitor_quote_id
  ON public.recipes(source_competitor_quote_id)
  WHERE source_competitor_quote_id IS NOT NULL;