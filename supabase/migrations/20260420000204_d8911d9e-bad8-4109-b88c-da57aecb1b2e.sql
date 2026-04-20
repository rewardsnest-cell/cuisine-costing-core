-- Add pricing & copycat columns to recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS serving_size text,
  ADD COLUMN IF NOT EXISTS calculated_cost_per_person numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price_per_person numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_percentage numeric,
  ADD COLUMN IF NOT EXISTS is_copycat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS copycat_source text;

CREATE INDEX IF NOT EXISTS idx_recipes_is_copycat ON public.recipes (is_copycat) WHERE is_copycat = true;
CREATE INDEX IF NOT EXISTS idx_recipes_active_category ON public.recipes (active, category);

-- Helper to compute selling price using per-recipe override OR global multiplier
CREATE OR REPLACE FUNCTION public.compute_recipe_selling_price(_cost_per_serving numeric, _markup_percentage numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT round(
    (COALESCE(_cost_per_serving, 0) *
      CASE
        WHEN _markup_percentage IS NOT NULL AND _markup_percentage > 0
          THEN (1 + _markup_percentage / 100.0)
        ELSE COALESCE((SELECT markup_multiplier FROM public.app_settings WHERE id = 1), 3.0)
      END
    )::numeric, 2)
$$;

-- Sync calculated_cost_per_person & selling_price_per_person from cost_per_serving
CREATE OR REPLACE FUNCTION public.trg_recipe_sync_pricing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.calculated_cost_per_person := COALESCE(NEW.cost_per_serving, 0);
  NEW.selling_price_per_person := public.compute_recipe_selling_price(NEW.cost_per_serving, NEW.markup_percentage);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_sync_pricing_columns ON public.recipes;
CREATE TRIGGER recipes_sync_pricing_columns
BEFORE INSERT OR UPDATE OF cost_per_serving, markup_percentage ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.trg_recipe_sync_pricing_columns();

-- Backfill existing rows
UPDATE public.recipes
SET calculated_cost_per_person = COALESCE(cost_per_serving, 0),
    selling_price_per_person = public.compute_recipe_selling_price(cost_per_serving, markup_percentage);

-- Generic touch trigger to ensure recipes.updated_at refreshes when only the new columns change
CREATE OR REPLACE FUNCTION public.trg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;