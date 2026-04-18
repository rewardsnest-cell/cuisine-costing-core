WITH conv AS (
  SELECT ri.recipe_id,
    ri.quantity AS qty,
    LOWER(TRIM(ri.unit)) AS u,
    LOWER(TRIM(COALESCE(ii.unit, ''))) AS iu,
    COALESCE(ii.average_cost_per_unit, 0) AS cpu_inv,
    COALESCE(ri.cost_per_unit, 0) AS cpu_recipe,
    ri.inventory_item_id
  FROM public.recipe_ingredients ri
  LEFT JOIN public.inventory_items ii ON ii.id = ri.inventory_item_id
  WHERE ri.recipe_id IN (SELECT id FROM public.recipes WHERE source_competitor_quote_id IS NOT NULL)
),
factors AS (
  SELECT recipe_id,
    CASE
      WHEN inventory_item_id IS NULL THEN qty * cpu_recipe
      WHEN u = iu THEN qty * cpu_inv
      WHEN u IN ('lb','lbs','pound','pounds') AND iu IN ('lb','lbs','pound','pounds') THEN qty * cpu_inv
      WHEN u IN ('oz','ounce','ounces') AND iu IN ('lb','lbs','pound','pounds') THEN (qty/16.0) * cpu_inv
      WHEN u IN ('g','gram','grams') AND iu IN ('lb','lbs','pound','pounds') THEN (qty/453.592) * cpu_inv
      WHEN u IN ('kg','kilogram','kilograms') AND iu IN ('lb','lbs','pound','pounds') THEN (qty*2.20462) * cpu_inv
      WHEN u IN ('lb','lbs','pound','pounds') AND iu IN ('oz','ounce','ounces') THEN (qty*16.0) * cpu_inv
      WHEN u = 'cup' AND iu = 'qt' THEN (qty*0.25) * cpu_inv
      WHEN u IN ('tbsp','tablespoon') AND iu = 'qt' THEN (qty/64.0) * cpu_inv
      WHEN u IN ('tsp','teaspoon') AND iu = 'qt' THEN (qty/192.0) * cpu_inv
      WHEN u IN ('fl oz','floz') AND iu = 'qt' THEN (qty/32.0) * cpu_inv
      WHEN u = 'pint' AND iu = 'qt' THEN (qty*0.5) * cpu_inv
      WHEN u IN ('gal','gallon') AND iu = 'qt' THEN (qty*4.0) * cpu_inv
      WHEN u = 'cup' AND iu IN ('l','liter') THEN (qty*0.236588) * cpu_inv
      WHEN u IN ('tbsp','tablespoon') AND iu IN ('l','liter') THEN (qty*0.0147868) * cpu_inv
      WHEN u IN ('tsp','teaspoon') AND iu IN ('l','liter') THEN (qty*0.00492892) * cpu_inv
      WHEN u IN ('ml','milliliter') AND iu IN ('l','liter') THEN (qty*0.001) * cpu_inv
      WHEN u = 'qt' AND iu IN ('l','liter') THEN (qty*0.946353) * cpu_inv
      WHEN u IN ('gal','gallon') AND iu IN ('l','liter') THEN (qty*3.78541) * cpu_inv
      WHEN u IN ('ml','milliliter') AND iu = 'qt' THEN (qty/946.353) * cpu_inv
      -- incompatible units (oz↔bunch, tsp↔jar, oz↔pint) → use AI estimate, not the inventory price
      ELSE qty * cpu_recipe
    END AS line_cost
  FROM conv
),
totals AS (
  SELECT recipe_id, SUM(line_cost) AS total FROM factors GROUP BY recipe_id
)
UPDATE public.recipes r
SET cost_per_serving = ROUND(t.total::numeric, 4),
    total_cost = ROUND((t.total * GREATEST(r.servings,1))::numeric, 4),
    updated_at = now()
FROM totals t
WHERE r.id = t.recipe_id;