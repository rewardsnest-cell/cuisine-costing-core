-- 1) Drop the restrictive source CHECK so we can add new sources
ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_source_check;

-- 2) Change source_id from uuid to text (Kroger SKUs, FRED series IDs aren't UUIDs)
--    Existing values are uuids; cast them to text.
ALTER TABLE public.price_history
  ALTER COLUMN source_id TYPE text USING source_id::text;

-- 3) New columns for the unified pricing contract
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS location_id text,
  ADD COLUMN IF NOT EXISTS promo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid,
  ADD COLUMN IF NOT EXISTS raw_package_price numeric;

-- 4) Re-add a broader source CHECK including the unified sources
ALTER TABLE public.price_history
  ADD CONSTRAINT price_history_source_check
  CHECK (source = ANY (ARRAY[
    'receipt'::text,
    'sale_flyer'::text,
    'purchase_order'::text,
    'kroger'::text,
    'kroger_api'::text,
    'fred'::text,
    'competitor'::text,
    'manual'::text
  ]));

-- 5) Backfill location_id and promo from notes for existing kroger rows
UPDATE public.price_history
SET location_id = substring(notes from 'loc=([^ ]+)')
WHERE location_id IS NULL
  AND notes ~ 'loc=';

UPDATE public.price_history
SET promo = true
WHERE promo = false
  AND source IN ('kroger', 'kroger_api')
  AND notes ~ 'promo=';

-- 6) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_price_history_ingest_run ON public.price_history (ingest_run_id) WHERE ingest_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_history_source_promo ON public.price_history (source, promo, observed_at DESC);

-- 7) Add review_state to kroger_sku_map (separate from `status`) and confidence default
--    `status` already exists ('unmapped'/'confirmed'); add review_state for the lifecycle the spec calls out.
ALTER TABLE public.kroger_sku_map
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'auto'
  CHECK (review_state IN ('auto', 'pending', 'confirmed', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_kroger_sku_map_review_state ON public.kroger_sku_map (review_state);

-- 8) Resumable bootstrap: track which search terms have been crawled per run
CREATE TABLE IF NOT EXISTS public.kroger_bootstrap_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.kroger_ingest_runs(id) ON DELETE CASCADE,
  search_term text NOT NULL,
  page integer NOT NULL DEFAULT 1,
  products_seen integer NOT NULL DEFAULT 0,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (run_id, search_term)
);

ALTER TABLE public.kroger_bootstrap_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage kroger bootstrap progress"
  ON public.kroger_bootstrap_progress
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_kroger_bootstrap_progress_run ON public.kroger_bootstrap_progress (run_id, completed_at);