
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS kroger_product_id TEXT,
  ADD COLUMN IF NOT EXISTS pack_weight_grams NUMERIC,
  ADD COLUMN IF NOT EXISTS catalog_status TEXT NOT NULL DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS catalog_notes TEXT,
  ADD COLUMN IF NOT EXISTS catalog_validated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inventory_items_catalog_status
  ON public.inventory_items (catalog_status);

CREATE INDEX IF NOT EXISTS idx_inventory_items_kroger_product_id
  ON public.inventory_items (kroger_product_id)
  WHERE kroger_product_id IS NOT NULL;
