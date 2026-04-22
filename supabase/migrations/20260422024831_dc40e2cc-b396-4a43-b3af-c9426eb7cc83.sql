-- 1) Feature flag (off by default)
INSERT INTO public.app_kv (key, value)
VALUES ('enable_kroger_ingest', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2) SKU -> ingredient_reference mapping (never inventory_items directly)
CREATE TABLE IF NOT EXISTS public.kroger_sku_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  product_name text,
  product_name_normalized text,
  reference_id uuid REFERENCES public.ingredient_reference(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unmapped' CHECK (status IN ('unmapped','suggested','confirmed','rejected')),
  match_confidence numeric,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku)
);

CREATE INDEX IF NOT EXISTS idx_kroger_sku_map_status ON public.kroger_sku_map(status);
CREATE INDEX IF NOT EXISTS idx_kroger_sku_map_reference ON public.kroger_sku_map(reference_id);

ALTER TABLE public.kroger_sku_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage kroger sku map"
  ON public.kroger_sku_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read kroger sku map"
  ON public.kroger_sku_map FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_kroger_sku_map_touch
  BEFORE UPDATE ON public.kroger_sku_map
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();

-- 3) Read-only sanity-check signals (Kroger vs inventory)
-- Returns one row per inventory_item with comparable Kroger pricing; UI decides display.
CREATE OR REPLACE FUNCTION public.kroger_price_signals()
RETURNS TABLE (
  inventory_item_id uuid,
  inventory_name text,
  inventory_unit text,
  inventory_avg numeric,
  inventory_last_update timestamptz,
  kroger_30d_median numeric,
  kroger_sample_count integer,
  kroger_last_observed timestamptz,
  flag text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH kroger AS (
    SELECT ph.inventory_item_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ph.unit_price)::numeric AS median_30d,
           COUNT(*)::int AS sample_count,
           MAX(ph.observed_at) AS last_observed
    FROM public.price_history ph
    WHERE ph.source = 'kroger_api'
      AND ph.observed_at >= now() - interval '30 days'
      AND ph.inventory_item_id IS NOT NULL
    GROUP BY ph.inventory_item_id
  )
  SELECT i.id,
         i.name,
         i.unit,
         i.average_cost_per_unit,
         i.updated_at,
         k.median_30d,
         COALESCE(k.sample_count, 0),
         k.last_observed,
         CASE
           WHEN k.median_30d IS NULL THEN 'no_signal'
           WHEN i.average_cost_per_unit > 0
            AND i.average_cost_per_unit < k.median_30d * 0.70 THEN 'inventory_cheap'
           WHEN i.average_cost_per_unit > 0
            AND i.average_cost_per_unit > k.median_30d * 1.40 THEN 'inventory_expensive'
           WHEN i.updated_at < now() - interval '90 days'
            AND k.sample_count >= 3 THEN 'stale_inventory'
           ELSE 'ok'
         END AS flag
  FROM public.inventory_items i
  LEFT JOIN kroger k ON k.inventory_item_id = i.id;
$$;

GRANT EXECUTE ON FUNCTION public.kroger_price_signals() TO authenticated;