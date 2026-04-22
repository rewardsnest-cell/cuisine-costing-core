-- Phase 3: Recipe pricing health derivation
-- Adds a deterministic SQL function that returns derived pricing health
-- (blocked/warning/healthy) for one recipe, plus a bulk function for lists.
-- Does NOT change costs, markups, tiers, taxes, or rounding.

-- Configurable freshness threshold (days). Stored in app_kv so admins can tune.
INSERT INTO public.app_kv (key, value)
VALUES ('pricing_freshness_days', '90')
ON CONFLICT (key) DO NOTHING;

-- Per-recipe pricing health checklist
CREATE OR REPLACE FUNCTION public.recipe_pricing_health(_recipe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  ing record;
  ref_row record;
  inv_row record;
  factor numeric;
  freshness_days int;
  stale_threshold timestamptz;
  checks jsonb := '[]'::jsonb;
  failed_blocks int := 0;
  failed_warnings int := 0;
  status text;
  ing_total int := 0;
  ing_resolved int := 0;
  ing_units_ok int := 0;
  ing_density_ok int := 0;
  ing_waste_ok int := 0;
  ing_price_ok int := 0;
  ing_fresh_ok int := 0;
  resolution_errors jsonb := '[]'::jsonb;
  unit_errors jsonb := '[]'::jsonb;
  density_errors jsonb := '[]'::jsonb;
  waste_errors jsonb := '[]'::jsonb;
  price_errors jsonb := '[]'::jsonb;
  fresh_errors jsonb := '[]'::jsonb;
  _from_unit text; _to_unit text;
  _is_w_from boolean; _is_v_from boolean;
  _is_w_to boolean; _is_v_to boolean;
  _crosses boolean;
BEGIN
  SELECT id, pricing_status, pricing_errors INTO rec FROM recipes WHERE id = _recipe_id;
  IF rec.id IS NULL THEN
    RETURN jsonb_build_object(
      'health_status', 'blocked',
      'pricing_status', 'unknown',
      'checks', '[]'::jsonb,
      'reason', 'Recipe not found'
    );
  END IF;

  SELECT COALESCE(NULLIF(value,'')::int, 90) INTO freshness_days FROM app_kv WHERE key = 'pricing_freshness_days';
  freshness_days := COALESCE(freshness_days, 90);
  stale_threshold := now() - (freshness_days || ' days')::interval;

  FOR ing IN
    SELECT ri.id, ri.name, ri.quantity, ri.unit, ri.reference_id, ri.inventory_item_id
    FROM recipe_ingredients ri
    WHERE ri.recipe_id = _recipe_id
  LOOP
    ing_total := ing_total + 1;

    -- 1. Resolution
    IF ing.reference_id IS NULL THEN
      resolution_errors := resolution_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', 'Not linked to ingredient_reference'
      );
      CONTINUE;
    END IF;
    ing_resolved := ing_resolved + 1;

    SELECT id, inventory_item_id, density_g_per_ml, waste_factor
      INTO ref_row
      FROM ingredient_reference WHERE id = ing.reference_id;

    -- 4. Waste validity
    IF ref_row.waste_factor IS NULL OR ref_row.waste_factor <= 0 OR ref_row.waste_factor > 1 THEN
      waste_errors := waste_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', 'waste_factor must be between 0 (exclusive) and 1'
      );
    ELSE
      ing_waste_ok := ing_waste_ok + 1;
    END IF;

    -- 5. Price source
    IF ref_row.inventory_item_id IS NULL THEN
      price_errors := price_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', 'No inventory item linked to ingredient_reference'
      );
      CONTINUE;
    END IF;

    SELECT id, name, unit, average_cost_per_unit, updated_at
      INTO inv_row
      FROM inventory_items WHERE id = ref_row.inventory_item_id;

    IF inv_row.id IS NULL OR COALESCE(inv_row.average_cost_per_unit, 0) <= 0 THEN
      price_errors := price_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', 'Linked inventory item has no positive average cost'
      );
      CONTINUE;
    END IF;
    ing_price_ok := ing_price_ok + 1;

    -- 3. Density (only required for cross weight<->volume)
    _from_unit := lower(trim(coalesce(ing.unit, '')));
    _to_unit   := lower(trim(coalesce(inv_row.unit, '')));
    _is_w_from := _from_unit IN ('g','gram','grams','kg','kilogram','kilograms','oz','ounce','ounces','lb','lbs','pound','pounds');
    _is_v_from := _from_unit IN ('ml','milliliter','l','liter','liters','litre','tsp','teaspoon','teaspoons','tbsp','tablespoon','tablespoons','fl oz','floz','cup','cups','c','pt','pint','pints','qt','quart','quarts','gal','gallon','gallons','pinch','pinches','dash','dashes','drop','drops');
    _is_w_to   := _to_unit IN ('g','gram','grams','kg','kilogram','kilograms','oz','ounce','ounces','lb','lbs','pound','pounds');
    _is_v_to   := _to_unit IN ('ml','milliliter','l','liter','liters','litre','tsp','teaspoon','teaspoons','tbsp','tablespoon','tablespoons','fl oz','floz','cup','cups','c','pt','pint','pints','qt','quart','quarts','gal','gallon','gallons','pinch','pinches','dash','dashes','drop','drops');
    _crosses := (_is_w_from AND _is_v_to) OR (_is_v_from AND _is_w_to);

    IF _crosses AND ref_row.density_g_per_ml IS NULL THEN
      density_errors := density_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', format('Weight<->volume conversion (%s to %s) requires density on ingredient_reference', ing.unit, inv_row.unit)
      );
    ELSE
      ing_density_ok := ing_density_ok + 1;
    END IF;

    -- 2. Unit convertibility
    factor := public.convert_unit_factor(ing.unit, inv_row.unit, ref_row.density_g_per_ml);
    IF factor IS NULL THEN
      unit_errors := unit_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', format('Cannot convert %s to %s', ing.unit, inv_row.unit)
      );
    ELSE
      ing_units_ok := ing_units_ok + 1;
    END IF;

    -- 6. Cost freshness (warning only)
    IF inv_row.updated_at < stale_threshold THEN
      fresh_errors := fresh_errors || jsonb_build_object(
        'ingredient', ing.name,
        'message', format('Inventory cost not updated in %s+ days', freshness_days)
      );
    ELSE
      ing_fresh_ok := ing_fresh_ok + 1;
    END IF;
  END LOOP;

  -- Build checks array
  checks := jsonb_build_array(
    jsonb_build_object(
      'key', 'resolution',
      'label', 'Ingredient resolution',
      'severity', 'block',
      'passed', jsonb_array_length(resolution_errors) = 0 AND ing_total > 0,
      'count_ok', ing_resolved,
      'count_total', ing_total,
      'errors', resolution_errors
    ),
    jsonb_build_object(
      'key', 'units',
      'label', 'Unit convertibility',
      'severity', 'block',
      'passed', jsonb_array_length(unit_errors) = 0,
      'count_ok', ing_units_ok,
      'count_total', ing_total,
      'errors', unit_errors
    ),
    jsonb_build_object(
      'key', 'density',
      'label', 'Density completeness',
      'severity', 'block',
      'passed', jsonb_array_length(density_errors) = 0,
      'count_ok', ing_density_ok,
      'count_total', ing_total,
      'errors', density_errors
    ),
    jsonb_build_object(
      'key', 'waste',
      'label', 'Waste / yield validity',
      'severity', 'block',
      'passed', jsonb_array_length(waste_errors) = 0,
      'count_ok', ing_waste_ok,
      'count_total', ing_total,
      'errors', waste_errors
    ),
    jsonb_build_object(
      'key', 'price',
      'label', 'Price source presence',
      'severity', 'block',
      'passed', jsonb_array_length(price_errors) = 0,
      'count_ok', ing_price_ok,
      'count_total', ing_total,
      'errors', price_errors
    ),
    jsonb_build_object(
      'key', 'freshness',
      'label', 'Cost freshness',
      'severity', 'warn',
      'passed', jsonb_array_length(fresh_errors) = 0,
      'count_ok', ing_fresh_ok,
      'count_total', ing_total,
      'threshold_days', freshness_days,
      'errors', fresh_errors
    )
  );

  -- Phase 1 status is the source of truth for blocked
  IF COALESCE(rec.pricing_status, 'valid') <> 'valid' THEN
    status := 'blocked';
  ELSIF jsonb_array_length(fresh_errors) > 0 THEN
    status := 'warning';
  ELSE
    status := 'healthy';
  END IF;

  RETURN jsonb_build_object(
    'health_status', status,
    'pricing_status', COALESCE(rec.pricing_status, 'valid'),
    'pricing_errors', COALESCE(rec.pricing_errors, '[]'::jsonb),
    'freshness_days', freshness_days,
    'ingredient_count', ing_total,
    'checks', checks
  );
END;
$$;

-- Bulk: returns one row per recipe with health status only (for list filtering)
CREATE OR REPLACE FUNCTION public.recipe_pricing_health_summary()
RETURNS TABLE(
  recipe_id uuid,
  health_status text,
  stale_ingredient_count int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  freshness_days int;
  stale_threshold timestamptz;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 90) INTO freshness_days FROM app_kv WHERE key = 'pricing_freshness_days';
  freshness_days := COALESCE(freshness_days, 90);
  stale_threshold := now() - (freshness_days || ' days')::interval;

  RETURN QUERY
  WITH stale_counts AS (
    SELECT ri.recipe_id,
           COUNT(*) FILTER (
             WHERE inv.updated_at < stale_threshold
           )::int AS stale_count
    FROM recipe_ingredients ri
    LEFT JOIN ingredient_reference ref ON ref.id = ri.reference_id
    LEFT JOIN inventory_items inv ON inv.id = ref.inventory_item_id
    GROUP BY ri.recipe_id
  )
  SELECT
    r.id,
    CASE
      WHEN COALESCE(r.pricing_status, 'valid') <> 'valid' THEN 'blocked'
      WHEN COALESCE(sc.stale_count, 0) > 0 THEN 'warning'
      ELSE 'healthy'
    END,
    COALESCE(sc.stale_count, 0)
  FROM recipes r
  LEFT JOIN stale_counts sc ON sc.recipe_id = r.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recipe_pricing_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recipe_pricing_health_summary() TO authenticated;