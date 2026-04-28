CREATE TABLE IF NOT EXISTS public.pricing_v2_product_enrichment_off (
  upc_normalized TEXT PRIMARY KEY,
  off_status TEXT NOT NULL CHECK (off_status IN ('found','not_found','error')),
  off_product_name TEXT,
  off_brands TEXT,
  off_categories TEXT,
  off_quantity TEXT,
  nutrition_present BOOLEAN,
  ingredients_present BOOLEAN,
  off_source TEXT NOT NULL DEFAULT 'open_food_facts',
  enrichment_confidence TEXT NOT NULL CHECK (enrichment_confidence IN ('high','medium','low','none')),
  raw_payload JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv2_off_fetched_at ON public.pricing_v2_product_enrichment_off (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_off_status ON public.pricing_v2_product_enrichment_off (off_status);

ALTER TABLE public.pricing_v2_product_enrichment_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pv2 off enrichment"
  ON public.pricing_v2_product_enrichment_off
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));