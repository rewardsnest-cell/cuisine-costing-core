-- 1. Reference table
CREATE TABLE IF NOT EXISTS public.ingredient_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  canonical_normalized text NOT NULL,
  default_unit text NOT NULL DEFAULT 'each',
  density_g_per_ml numeric,
  waste_factor numeric NOT NULL DEFAULT 1.0,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_reference_canonical_normalized_key
  ON public.ingredient_reference(canonical_normalized);
CREATE INDEX IF NOT EXISTS ingredient_reference_inventory_item_id_idx
  ON public.ingredient_reference(inventory_item_id);
CREATE INDEX IF NOT EXISTS ingredient_reference_canonical_trgm_idx
  ON public.ingredient_reference USING gin (canonical_normalized gin_trgm_ops);

ALTER TABLE public.ingredient_reference ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read ingredient reference"
    ON public.ingredient_reference FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage ingredient reference"
    ON public.ingredient_reference FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'admin'))
    WITH CHECK (has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS ingredient_reference_updated_at ON public.ingredient_reference;
CREATE TRIGGER ingredient_reference_updated_at
  BEFORE UPDATE ON public.ingredient_reference
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Normalize helper
CREATE OR REPLACE FUNCTION public.normalize_ingredient_name(_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT trim(regexp_replace(lower(coalesce(_name,'')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- 3. Seed from inventory_items
INSERT INTO public.ingredient_reference (canonical_name, canonical_normalized, default_unit, inventory_item_id, category)
SELECT i.name, public.normalize_ingredient_name(i.name), COALESCE(NULLIF(i.unit,''),'each'), i.id, i.category
FROM public.inventory_items i
WHERE public.normalize_ingredient_name(i.name) <> ''
ON CONFLICT (canonical_normalized) DO UPDATE
  SET inventory_item_id = EXCLUDED.inventory_item_id,
      default_unit = EXCLUDED.default_unit,
      category = COALESCE(EXCLUDED.category, public.ingredient_reference.category),
      updated_at = now();

-- 4. Seed from synonyms canonicals
INSERT INTO public.ingredient_reference (canonical_name, canonical_normalized, default_unit)
SELECT DISTINCT s.canonical, public.normalize_ingredient_name(s.canonical), 'each'
FROM public.ingredient_synonyms s
WHERE public.normalize_ingredient_name(s.canonical) <> ''
ON CONFLICT (canonical_normalized) DO NOTHING;

-- 5. Add reference_id columns
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS reference_id uuid REFERENCES public.ingredient_reference(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS recipe_ingredients_reference_id_idx
  ON public.recipe_ingredients(reference_id);

ALTER TABLE public.ingredient_synonyms
  ADD COLUMN IF NOT EXISTS reference_id uuid REFERENCES public.ingredient_reference(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ingredient_synonyms_reference_id_idx
  ON public.ingredient_synonyms(reference_id);

-- 6. Backfill recipe_ingredients via inventory link
UPDATE public.recipe_ingredients ri SET reference_id = r.id
FROM public.ingredient_reference r
WHERE ri.reference_id IS NULL AND ri.inventory_item_id IS NOT NULL
  AND r.inventory_item_id = ri.inventory_item_id;

-- 7. Backfill recipe_ingredients via name match
UPDATE public.recipe_ingredients ri SET reference_id = r.id
FROM public.ingredient_reference r
WHERE ri.reference_id IS NULL
  AND r.canonical_normalized = public.normalize_ingredient_name(ri.name);

-- 8. Backfill synonyms
UPDATE public.ingredient_synonyms s SET reference_id = r.id
FROM public.ingredient_reference r
WHERE s.reference_id IS NULL
  AND r.canonical_normalized = public.normalize_ingredient_name(s.canonical);

-- 9. Unit conversion helper (with optional density)
CREATE OR REPLACE FUNCTION public.convert_unit_factor(
  from_unit text, to_unit text, density_g_per_ml numeric DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  fu text := lower(trim(coalesce(from_unit,'')));
  tu text := lower(trim(coalesce(to_unit,'')));
  w_g numeric; w_g_to numeric; v_ml numeric; v_ml_to numeric;
BEGIN
  IF fu = '' OR tu = '' THEN RETURN NULL; END IF;
  IF fu = tu THEN RETURN 1; END IF;

  w_g := CASE fu
    WHEN 'g' THEN 1 WHEN 'gram' THEN 1 WHEN 'grams' THEN 1
    WHEN 'kg' THEN 1000 WHEN 'kilogram' THEN 1000 WHEN 'kilograms' THEN 1000
    WHEN 'oz' THEN 28.3495 WHEN 'ounce' THEN 28.3495 WHEN 'ounces' THEN 28.3495
    WHEN 'lb' THEN 453.592 WHEN 'lbs' THEN 453.592 WHEN 'pound' THEN 453.592 WHEN 'pounds' THEN 453.592
    ELSE NULL END;
  w_g_to := CASE tu
    WHEN 'g' THEN 1 WHEN 'gram' THEN 1 WHEN 'grams' THEN 1
    WHEN 'kg' THEN 1000 WHEN 'kilogram' THEN 1000 WHEN 'kilograms' THEN 1000
    WHEN 'oz' THEN 28.3495 WHEN 'ounce' THEN 28.3495 WHEN 'ounces' THEN 28.3495
    WHEN 'lb' THEN 453.592 WHEN 'lbs' THEN 453.592 WHEN 'pound' THEN 453.592 WHEN 'pounds' THEN 453.592
    ELSE NULL END;
  v_ml := CASE fu
    WHEN 'ml' THEN 1 WHEN 'milliliter' THEN 1
    WHEN 'l' THEN 1000 WHEN 'liter' THEN 1000 WHEN 'liters' THEN 1000 WHEN 'litre' THEN 1000
    WHEN 'tsp' THEN 4.92892 WHEN 'teaspoon' THEN 4.92892 WHEN 'teaspoons' THEN 4.92892
    WHEN 'tbsp' THEN 14.7868 WHEN 'tablespoon' THEN 14.7868 WHEN 'tablespoons' THEN 14.7868
    WHEN 'fl oz' THEN 29.5735 WHEN 'floz' THEN 29.5735
    WHEN 'cup' THEN 236.588 WHEN 'cups' THEN 236.588 WHEN 'c' THEN 236.588
    WHEN 'pt' THEN 473.176 WHEN 'pint' THEN 473.176 WHEN 'pints' THEN 473.176
    WHEN 'qt' THEN 946.353 WHEN 'quart' THEN 946.353 WHEN 'quarts' THEN 946.353
    WHEN 'gal' THEN 3785.41 WHEN 'gallon' THEN 3785.41 WHEN 'gallons' THEN 3785.41
    ELSE NULL END;
  v_ml_to := CASE tu
    WHEN 'ml' THEN 1 WHEN 'milliliter' THEN 1
    WHEN 'l' THEN 1000 WHEN 'liter' THEN 1000 WHEN 'liters' THEN 1000 WHEN 'litre' THEN 1000
    WHEN 'tsp' THEN 4.92892 WHEN 'teaspoon' THEN 4.92892 WHEN 'teaspoons' THEN 4.92892
    WHEN 'tbsp' THEN 14.7868 WHEN 'tablespoon' THEN 14.7868 WHEN 'tablespoons' THEN 14.7868
    WHEN 'fl oz' THEN 29.5735 WHEN 'floz' THEN 29.5735
    WHEN 'cup' THEN 236.588 WHEN 'cups' THEN 236.588 WHEN 'c' THEN 236.588
    WHEN 'pt' THEN 473.176 WHEN 'pint' THEN 473.176 WHEN 'pints' THEN 473.176
    WHEN 'qt' THEN 946.353 WHEN 'quart' THEN 946.353 WHEN 'quarts' THEN 946.353
    WHEN 'gal' THEN 3785.41 WHEN 'gallon' THEN 3785.41 WHEN 'gallons' THEN 3785.41
    ELSE NULL END;

  IF w_g IS NOT NULL AND w_g_to IS NOT NULL THEN RETURN w_g / w_g_to; END IF;
  IF v_ml IS NOT NULL AND v_ml_to IS NOT NULL THEN RETURN v_ml / v_ml_to; END IF;
  IF w_g IS NOT NULL AND v_ml_to IS NOT NULL AND density_g_per_ml IS NOT NULL AND density_g_per_ml > 0 THEN
    RETURN (w_g / density_g_per_ml) / v_ml_to;
  END IF;
  IF v_ml IS NOT NULL AND w_g_to IS NOT NULL AND density_g_per_ml IS NOT NULL AND density_g_per_ml > 0 THEN
    RETURN (v_ml * density_g_per_ml) / w_g_to;
  END IF;
  RETURN NULL;
END;
$$;

-- 10. Refactor recompute_recipe_cost (scalar variables; no record-not-assigned bug)
CREATE OR REPLACE FUNCTION public.recompute_recipe_cost(_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  total numeric := 0;
  per_serving numeric := 0;
  s integer;
  ing RECORD;
  ref_id uuid; ref_inventory_id uuid; ref_density numeric; ref_waste numeric;
  inv_id uuid; inv_unit text; inv_cost numeric;
  factor numeric; effective_qty numeric; line_cost numeric;
BEGIN
  SELECT COALESCE(servings, 1) INTO s FROM recipes WHERE id = _recipe_id;
  IF s IS NULL THEN RETURN; END IF;

  FOR ing IN
    SELECT ri.quantity, ri.unit, ri.cost_per_unit, ri.inventory_item_id, ri.reference_id, ri.name
    FROM recipe_ingredients ri WHERE ri.recipe_id = _recipe_id
  LOOP
    line_cost := 0;
    ref_id := NULL; ref_inventory_id := NULL; ref_density := NULL; ref_waste := 1.0;
    inv_id := NULL; inv_unit := NULL; inv_cost := NULL;

    IF ing.reference_id IS NOT NULL THEN
      SELECT id, inventory_item_id, density_g_per_ml, COALESCE(waste_factor, 1.0)
        INTO ref_id, ref_inventory_id, ref_density, ref_waste
      FROM ingredient_reference WHERE id = ing.reference_id;
    ELSE
      SELECT id, inventory_item_id, density_g_per_ml, COALESCE(waste_factor, 1.0)
        INTO ref_id, ref_inventory_id, ref_density, ref_waste
      FROM ingredient_reference
      WHERE canonical_normalized = public.normalize_ingredient_name(ing.name)
      LIMIT 1;
    END IF;

    IF ref_inventory_id IS NOT NULL THEN
      SELECT id, unit, average_cost_per_unit INTO inv_id, inv_unit, inv_cost
      FROM inventory_items WHERE id = ref_inventory_id;
    ELSIF ing.inventory_item_id IS NOT NULL THEN
      SELECT id, unit, average_cost_per_unit INTO inv_id, inv_unit, inv_cost
      FROM inventory_items WHERE id = ing.inventory_item_id;
    END IF;

    IF inv_id IS NOT NULL AND COALESCE(inv_cost, 0) > 0 THEN
      factor := public.convert_unit_factor(ing.unit, inv_unit, ref_density);
      IF factor IS NOT NULL THEN
        effective_qty := COALESCE(ing.quantity, 0) * factor / GREATEST(COALESCE(ref_waste, 1.0), 0.01);
        line_cost := effective_qty * inv_cost;
      ELSIF lower(coalesce(ing.unit,'')) = lower(coalesce(inv_unit,'')) THEN
        line_cost := COALESCE(ing.quantity, 0) * inv_cost
                     / GREATEST(COALESCE(ref_waste, 1.0), 0.01);
      ELSE
        line_cost := COALESCE(ing.quantity, 0) * COALESCE(ing.cost_per_unit, inv_cost);
      END IF;
    ELSE
      line_cost := COALESCE(ing.quantity, 0) * COALESCE(ing.cost_per_unit, 0);
    END IF;

    total := total + line_cost;
  END LOOP;

  per_serving := CASE WHEN s > 0 THEN total / s ELSE total END;

  UPDATE recipes SET total_cost = total, cost_per_serving = per_serving, updated_at = now()
   WHERE id = _recipe_id;
END;
$$;

-- 11. Refactor find_ingredient_matches
DROP FUNCTION IF EXISTS public.find_ingredient_matches(text, integer);
CREATE FUNCTION public.find_ingredient_matches(_name text, _limit integer DEFAULT 5)
RETURNS TABLE(
  inventory_item_id uuid, inventory_name text, inventory_unit text,
  similarity real, source text, reference_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE norm text := public.normalize_ingredient_name(_name);
BEGIN
  IF norm = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.name, i.unit, 1.0::real, 'synonym'::text, r.id
  FROM ingredient_synonyms s
  JOIN ingredient_reference r ON r.id = s.reference_id
                              OR r.canonical_normalized = public.normalize_ingredient_name(s.canonical)
  LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
  WHERE s.alias_normalized = norm
  LIMIT _limit;

  RETURN QUERY
  SELECT i.id, i.name, i.unit,
         similarity(r.canonical_normalized, norm)::real,
         'reference'::text, r.id
  FROM ingredient_reference r
  LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
  WHERE similarity(r.canonical_normalized, norm) > 0.3
  ORDER BY similarity(r.canonical_normalized, norm) DESC
  LIMIT _limit;

  RETURN QUERY
  SELECT i.id, i.name, i.unit,
         similarity(lower(i.name), norm)::real,
         'inventory'::text, NULL::uuid
  FROM inventory_items i
  WHERE similarity(lower(i.name), norm) > 0.3
  ORDER BY similarity(lower(i.name), norm) DESC
  LIMIT _limit;
END;
$$;

-- 12. Auto-link reference_id on recipe_ingredients
CREATE OR REPLACE FUNCTION public.trg_recipe_ing_autolink_reference()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.reference_id IS NULL THEN
    SELECT id INTO NEW.reference_id FROM ingredient_reference
      WHERE canonical_normalized = public.normalize_ingredient_name(NEW.name) LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipe_ing_autolink_reference ON public.recipe_ingredients;
CREATE TRIGGER recipe_ing_autolink_reference
  BEFORE INSERT OR UPDATE OF name, reference_id ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.trg_recipe_ing_autolink_reference();

-- 13. Auto-create reference for new inventory items
CREATE OR REPLACE FUNCTION public.trg_inventory_create_reference()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO ingredient_reference (canonical_name, canonical_normalized, default_unit, inventory_item_id, category)
  VALUES (NEW.name, public.normalize_ingredient_name(NEW.name), COALESCE(NULLIF(NEW.unit,''),'each'), NEW.id, NEW.category)
  ON CONFLICT (canonical_normalized) DO UPDATE
    SET inventory_item_id = COALESCE(public.ingredient_reference.inventory_item_id, EXCLUDED.inventory_item_id),
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_create_reference ON public.inventory_items;
CREATE TRIGGER inventory_create_reference
  AFTER INSERT ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventory_create_reference();

-- 14. Recompute all recipe costs
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM recipes LOOP
    PERFORM public.recompute_recipe_cost(r.id);
  END LOOP;
END $$;