ALTER TABLE public.sales_review_asks
  ADD COLUMN IF NOT EXISTS star_rating SMALLINT
    CHECK (star_rating IS NULL OR (star_rating BETWEEN 1 AND 5));