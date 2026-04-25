ALTER TABLE public.pricing_v2_settings
  ADD COLUMN IF NOT EXISTS min_mapped_inventory_for_bootstrap integer NOT NULL DEFAULT 10;