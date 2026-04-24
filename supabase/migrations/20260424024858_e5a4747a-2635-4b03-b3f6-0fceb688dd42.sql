ALTER TABLE public.kroger_sku_map
  ADD COLUMN IF NOT EXISTS upc TEXT,
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS regular_price NUMERIC,
  ADD COLUMN IF NOT EXISTS promo_price NUMERIC,
  ADD COLUMN IF NOT EXISTS price_unit_size TEXT,
  ADD COLUMN IF NOT EXISTS price_observed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_kroger_sku_map_upc ON public.kroger_sku_map (upc);
CREATE INDEX IF NOT EXISTS idx_kroger_sku_map_product_id ON public.kroger_sku_map (product_id);