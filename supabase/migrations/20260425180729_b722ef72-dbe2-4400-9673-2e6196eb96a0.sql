-- 1) New stage enum values for runs/errors
ALTER TYPE public.pricing_v2_stage ADD VALUE IF NOT EXISTS 'recipe_weight_normalization';
ALTER TYPE public.pricing_v2_stage ADD VALUE IF NOT EXISTS 'recipe_weight_normalization_test';

-- 2) Normalization status enum
DO $$ BEGIN
  CREATE TYPE public.recipe_ingredient_norm_status AS ENUM (
    'normalized',
    'blocked_missing_weight',
    'blocked_ambiguous_unit',
    'blocked_unmapped_inventory'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Extend recipe_ingredients
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS quantity_grams numeric,
  ADD COLUMN IF NOT EXISTS original_quantity numeric,
  ADD COLUMN IF NOT EXISTS original_unit text,
  ADD COLUMN IF NOT EXISTS conversion_source text,
  ADD COLUMN IF NOT EXISTS conversion_notes text,
  ADD COLUMN IF NOT EXISTS normalization_status public.recipe_ingredient_norm_status,
  ADD COLUMN IF NOT EXISTS last_normalize_run_id uuid REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_ing_norm_status
  ON public.recipe_ingredients(normalization_status)
  WHERE normalization_status IS DISTINCT FROM 'normalized';

-- 4) Per-piece weight on inventory
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS each_weight_grams numeric;

-- 5) Unit conversion rules table
CREATE TABLE IF NOT EXISTS public.pricing_v2_unit_conversion_rules (
  unit text PRIMARY KEY,
  grams_per_unit numeric,
  requires_density boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_v2_unit_conversion_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pv2 unit rules" ON public.pricing_v2_unit_conversion_rules;
CREATE POLICY "Admins manage pv2 unit rules"
  ON public.pricing_v2_unit_conversion_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_pv2_unit_rules_updated ON public.pricing_v2_unit_conversion_rules;
CREATE TRIGGER trg_pv2_unit_rules_updated
  BEFORE UPDATE ON public.pricing_v2_unit_conversion_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed weight-only units. Volume units intentionally absent (must block).
INSERT INTO public.pricing_v2_unit_conversion_rules(unit, grams_per_unit, requires_density, notes) VALUES
  ('g',     1,            false, 'grams (canonical)'),
  ('gram',  1,            false, 'grams (canonical)'),
  ('grams', 1,            false, 'grams (canonical)'),
  ('kg',    1000,         false, 'kilograms'),
  ('oz',    28.349523125, false, 'ounces (mass)'),
  ('ounce', 28.349523125, false, 'ounces (mass)'),
  ('lb',    453.59237,    false, 'pounds'),
  ('lbs',   453.59237,    false, 'pounds'),
  ('pound', 453.59237,    false, 'pounds'),
  -- Volume units present so the runner can return a clean VOLUME_UNIT_NO_DENSITY
  -- error rather than a generic "unknown unit". grams_per_unit stays NULL.
  ('cup',   NULL, true,  'volume — requires density'),
  ('cups',  NULL, true,  'volume — requires density'),
  ('tsp',   NULL, true,  'volume — requires density'),
  ('tbsp',  NULL, true,  'volume — requires density'),
  ('ml',    NULL, true,  'volume — requires density'),
  ('l',     NULL, true,  'volume — requires density'),
  ('liter', NULL, true,  'volume — requires density'),
  ('fl oz', NULL, true,  'volume — requires density')
ON CONFLICT (unit) DO NOTHING;