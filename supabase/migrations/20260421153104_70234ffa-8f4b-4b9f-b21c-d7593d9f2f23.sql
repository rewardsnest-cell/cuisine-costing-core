
-- 1) Add pricing integrity fields to recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS pricing_status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS pricing_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_pricing_status_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_pricing_status_check
  CHECK (pricing_status IN (
    'valid',
    'blocked_missing_ingredient',
    'blocked_missing_density',
    'blocked_missing_waste',
    'blocked_missing_price'
  ));

CREATE INDEX IF NOT EXISTS idx_recipes_pricing_status ON public.recipes(pricing_status);

-- 2) Rewrite recompute_recipe_cost with strict integrity rules
CREATE OR REPLACE FUNCTION public.recompute_recipe_cost(_recipe_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total numeric := 0;
  per_serving numeric := 0;
  s integer;
  ing RECORD;
  ref_id uuid; ref_inventory_id uuid; ref_density numeric; ref_waste numeric;
  inv_id uuid; inv_unit text; inv_cost numeric;
  factor numeric; effective_qty numeric; line_cost numeric;
  _status text := 'valid';
  _errors jsonb := '[]'::jsonb;
  _from_unit text; _to_unit text;
  _is_weight_from boolean; _is_volume_from boolean;
  _is_weight_to boolean; _is_volume_to boolean;
  _crosses_w_v boolean;
BEGIN
  SELECT COALESCE(servings, 1) INTO s FROM recipes WHERE id = _recipe_id;
  IF s IS NULL THEN RETURN; END IF;

  FOR ing IN
    SELECT ri.quantity, ri.unit, ri.cost_per_unit, ri.inventory_item_id, ri.reference_id, ri.name
    FROM recipe_ingredients ri WHERE ri.recipe_id = _recipe_id
  LOOP
    -- A) Ingredient reference enforcement
    IF ing.reference_id IS NULL THEN
      _status := 'blocked_missing_ingredient';
      _errors := _errors || jsonb_build_object(
        'ingredient', ing.name,
        'issue', 'missing_reference',
        'message', 'Ingredient is not linked to ingredient_reference'
      );
      CONTINUE;
    END IF;

    SELECT id, inventory_item_id, density_g_per_ml, waste_factor
      INTO ref_id, ref_inventory_id, ref_density, ref_waste
    FROM ingredient_reference WHERE id = ing.reference_id;

    -- D) Waste / yield validation
    IF ref_waste IS NULL OR ref_waste <= 0 OR ref_waste > 1 THEN
      IF _status = 'valid' THEN _status := 'blocked_missing_waste'; END IF;
      _errors := _errors || jsonb_build_object(
        'ingredient', ing.name,
        'issue', 'invalid_waste_factor',
        'message', 'waste_factor must be > 0 and <= 1'
      );
      CONTINUE;
    END IF;

    -- E) Price source requirement (no silent fallback to ri.cost_per_unit)
    IF ref_inventory_id IS NULL THEN
      IF _status = 'valid' THEN _status := 'blocked_missing_price'; END IF;
      _errors := _errors || jsonb_build_object(
        'ingredient', ing.name,
        'issue', 'no_price_source',
        'message', 'ingredient_reference is not linked to an inventory item'
      );
      CONTINUE;
    END IF;

    SELECT id, unit, average_cost_per_unit
      INTO inv_id, inv_unit, inv_cost
    FROM inventory_items WHERE id = ref_inventory_id;

    IF inv_id IS NULL OR COALESCE(inv_cost, 0) <= 0 THEN
      IF _status = 'valid' THEN _status := 'blocked_missing_price'; END IF;
      _errors := _errors || jsonb_build_object(
        'ingredient', ing.name,
        'issue', 'no_price_source',
        'message', 'Linked inventory item has no positive average_cost_per_unit'
      );
      CONTINUE;
    END IF;

    -- C) Density enforcement for weight <-> volume conversions
    _from_unit := lower(trim(coalesce(ing.unit, '')));
    _to_unit   := lower(trim(coalesce(inv_unit, '')));
    _is_weight_from := _from_unit IN ('g','gram','grams','kg','kilogram','kilograms','oz','ounce','ounces','lb','lbs','pound','pounds');
    _is_volume_from := _from_unit IN ('ml','milliliter','l','liter','liters','litre','tsp','teaspoon','teaspoons','tbsp','tablespoon','tablespoons','fl oz','floz','cup','cups','c','pt','pint','pints','qt','quart','quarts','gal','gallon','gallons','pinch','pinches','dash','dashes','drop','drops');
    _is_weight_to   := _to_unit IN ('g','gram','grams','kg','kilogram','kilograms','oz','ounce','ounces','lb','lbs','pound','pounds');
    _is_volume_to   := _to_unit IN ('ml','milliliter','l','liter','liters','litre','tsp','teaspoon','teaspoons','tbsp','tablespoon','tablespoons','fl oz','floz','cup','cups','c','pt','pint','pints','qt','quart','quarts','gal','gallon','gallons','pinch','pinches','dash','dashes','drop','drops');
    _crosses_w_v := (_is_weight_from AND _is_volume_to) OR (_is_volume_from AND _is_weight_to);

    IF _crosses_w_v AND ref_density IS NULL THEN
      IF _status = 'valid' THEN _status := 'blocked_missing_density'; END IF;
      _errors := _errors || jsonb_build_object(
        'ingredient', ing.name,
        'issue', 'missing_density',
        'message', 'Weight<->volume conversion requires density_g_per_ml on ingredient_reference'
      );
      CONTINUE;
    END IF;

    -- Compute conversion factor
    factor := public.convert_unit_factor(ing.unit, inv_unit, ref_density);

    IF factor IS NULL THEN
      -- Conversion impossible and no silent fallback allowed
      IF _status = 'valid' THEN _status := 'blocked_missing_price'; END IF;
      _errors := _errors || jsonb_build_object(
        'ingredient', ing.name,
        'issue', 'unit_conversion_failed',
        'message', format('Cannot convert %s to %s', ing.unit, inv_unit)
      );
      CONTINUE;
    END IF;

    effective_qty := COALESCE(ing.quantity, 0) * factor / ref_waste;
    line_cost := effective_qty * inv_cost;
    total := total + line_cost;
  END LOOP;

  -- F) Successful cost write only when all checks pass
  IF _status = 'valid' THEN
    per_serving := CASE WHEN s > 0 THEN total / s ELSE total END;
    UPDATE recipes
       SET total_cost = total,
           cost_per_serving = per_serving,
           pricing_status = 'valid',
           pricing_errors = '[]'::jsonb,
           updated_at = now()
     WHERE id = _recipe_id;
  ELSE
    UPDATE recipes
       SET pricing_status = _status,
           pricing_errors = _errors,
           updated_at = now()
     WHERE id = _recipe_id;
  END IF;
END;
$function$;

-- 3) Cascade safety: only propagate to quote_items when pricing is valid
CREATE OR REPLACE FUNCTION public.trg_recipe_cps_refresh_quote_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _markup numeric;
  _lock_days integer;
  _affected_quotes uuid[];
  qid uuid;
BEGIN
  IF NEW.cost_per_serving IS NOT DISTINCT FROM OLD.cost_per_serving THEN
    RETURN NEW;
  END IF;

  -- Block all cascades when pricing is not valid
  IF COALESCE(NEW.pricing_status, 'valid') <> 'valid' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(markup_multiplier, 3.0), COALESCE(revision_lock_days, 7)
    INTO _markup, _lock_days
  FROM public.app_settings WHERE id = 1;
  _markup := COALESCE(_markup, 3.0);
  _lock_days := COALESCE(_lock_days, 7);

  WITH updated AS (
    UPDATE public.quote_items qi
       SET unit_price = round((COALESCE(NEW.cost_per_serving, 0) * _markup)::numeric, 2),
           total_price = round((COALESCE(NEW.cost_per_serving, 0) * _markup * COALESCE(qi.quantity, 1))::numeric, 2)
      FROM public.quotes q
     WHERE qi.recipe_id = NEW.id
       AND q.id = qi.quote_id
       AND (q.event_date IS NULL OR CURRENT_DATE <= (q.event_date - _lock_days))
    RETURNING qi.quote_id
  )
  SELECT array_agg(DISTINCT quote_id) INTO _affected_quotes FROM updated;

  IF _affected_quotes IS NOT NULL THEN
    FOREACH qid IN ARRAY _affected_quotes LOOP
      PERFORM public.recompute_quote_totals(qid);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Backfill pricing_status for all existing recipes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.recipes LOOP
    PERFORM public.recompute_recipe_cost(r.id);
  END LOOP;
END $$;
