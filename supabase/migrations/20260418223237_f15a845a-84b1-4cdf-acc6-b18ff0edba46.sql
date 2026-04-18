-- 1. Enable pg_trgm for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Recipe cost recompute function
CREATE OR REPLACE FUNCTION public.recompute_recipe_cost(_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total numeric := 0;
  per_serving numeric := 0;
  s integer;
  ing RECORD;
  inv RECORD;
  line_cost numeric;
BEGIN
  SELECT COALESCE(servings, 1) INTO s FROM recipes WHERE id = _recipe_id;
  IF s IS NULL THEN RETURN; END IF;

  FOR ing IN
    SELECT ri.quantity, ri.unit, ri.cost_per_unit, ri.inventory_item_id
    FROM recipe_ingredients ri
    WHERE ri.recipe_id = _recipe_id
  LOOP
    line_cost := 0;
    IF ing.inventory_item_id IS NOT NULL THEN
      SELECT average_cost_per_unit, unit INTO inv
      FROM inventory_items WHERE id = ing.inventory_item_id;
      IF inv.average_cost_per_unit IS NOT NULL AND inv.average_cost_per_unit > 0 THEN
        -- Best-effort: if units match, use inv cost; otherwise fall back to recipe cost_per_unit
        IF lower(coalesce(ing.unit,'')) = lower(coalesce(inv.unit,'')) THEN
          line_cost := COALESCE(ing.quantity,0) * inv.average_cost_per_unit;
        ELSE
          line_cost := COALESCE(ing.quantity,0) * COALESCE(ing.cost_per_unit, inv.average_cost_per_unit);
        END IF;
      ELSE
        line_cost := COALESCE(ing.quantity,0) * COALESCE(ing.cost_per_unit, 0);
      END IF;
    ELSE
      line_cost := COALESCE(ing.quantity,0) * COALESCE(ing.cost_per_unit, 0);
    END IF;
    total := total + line_cost;
  END LOOP;

  per_serving := CASE WHEN s > 0 THEN total / s ELSE total END;

  UPDATE recipes
     SET total_cost = total,
         cost_per_serving = per_serving,
         updated_at = now()
   WHERE id = _recipe_id;
END;
$$;

-- 3. Trigger on recipe_ingredients changes
CREATE OR REPLACE FUNCTION public.trg_recipe_ing_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_recipe_cost(OLD.recipe_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_recipe_cost(NEW.recipe_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recipe_ing_changed ON public.recipe_ingredients;
CREATE TRIGGER recipe_ing_changed
AFTER INSERT OR UPDATE OR DELETE ON public.recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION public.trg_recipe_ing_changed();

-- 4. Trigger on inventory_items cost changes -> recompute every dependent recipe
CREATE OR REPLACE FUNCTION public.trg_inventory_cost_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  IF NEW.average_cost_per_unit IS DISTINCT FROM OLD.average_cost_per_unit THEN
    FOR rid IN SELECT DISTINCT recipe_id FROM recipe_ingredients WHERE inventory_item_id = NEW.id LOOP
      PERFORM public.recompute_recipe_cost(rid);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_cost_changed ON public.inventory_items;
CREATE TRIGGER inventory_cost_changed
AFTER UPDATE OF average_cost_per_unit ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.trg_inventory_cost_changed();

-- 5. Trigger on recipes.servings changes -> recompute cost_per_serving
CREATE OR REPLACE FUNCTION public.trg_recipe_servings_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.servings IS DISTINCT FROM OLD.servings THEN
    PERFORM public.recompute_recipe_cost(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipe_servings_changed ON public.recipes;
CREATE TRIGGER recipe_servings_changed
AFTER UPDATE OF servings ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.trg_recipe_servings_changed();

-- 6. Fuzzy ingredient matcher: returns top inventory matches for a free-text name
CREATE OR REPLACE FUNCTION public.find_ingredient_matches(_name text, _limit int DEFAULT 5)
RETURNS TABLE (
  inventory_item_id uuid,
  inventory_name text,
  inventory_unit text,
  similarity real,
  source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
BEGIN
  norm := lower(regexp_replace(coalesce(_name,''), '[^a-z0-9]+', ' ', 'g'));
  norm := trim(norm);
  IF norm = '' THEN RETURN; END IF;

  -- 1. Exact synonym hit (canonical -> inventory match)
  RETURN QUERY
  SELECT i.id, i.name, i.unit, 1.0::real AS similarity, 'synonym'::text AS source
  FROM ingredient_synonyms s
  JOIN inventory_items i
    ON lower(regexp_replace(i.name, '[^a-z0-9A-Z]+', ' ', 'g')) = lower(s.canonical)
   OR lower(i.name) = lower(s.canonical)
  WHERE s.alias_normalized = norm
  LIMIT _limit;

  -- 2. Trigram similarity on inventory names
  RETURN QUERY
  SELECT i.id, i.name, i.unit,
         similarity(lower(i.name), norm)::real AS similarity,
         'fuzzy'::text AS source
  FROM inventory_items i
  WHERE similarity(lower(i.name), norm) > 0.3
  ORDER BY similarity(lower(i.name), norm) DESC
  LIMIT _limit;
END;
$$;

-- Index to speed up trigram search
CREATE INDEX IF NOT EXISTS idx_inventory_items_name_trgm
  ON public.inventory_items USING gin (lower(name) gin_trgm_ops);

-- 7. Cost-health summary view
CREATE OR REPLACE VIEW public.cost_health_summary
WITH (security_invoker = true)
AS
SELECT
  (SELECT COUNT(*) FROM recipes WHERE active = true) AS total_active_recipes,
  (SELECT COUNT(*) FROM recipes WHERE active = true AND servings = 1) AS recipes_servings_one,
  (SELECT COUNT(*) FROM recipes WHERE active = true AND COALESCE(total_cost,0) = 0) AS recipes_zero_cost,
  (SELECT COUNT(*) FROM recipe_ingredients) AS total_ingredients,
  (SELECT COUNT(*) FROM recipe_ingredients WHERE inventory_item_id IS NULL) AS unlinked_ingredients,
  (SELECT COUNT(*) FROM inventory_items) AS inventory_items_count,
  (SELECT MAX(receipt_date) FROM receipts WHERE status IN ('reviewed','processed')) AS last_receipt_date;

-- 8. One-time recompute of every recipe so existing data benefits
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM recipes LOOP
    PERFORM public.recompute_recipe_cost(r.id);
  END LOOP;
END $$;