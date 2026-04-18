CREATE OR REPLACE FUNCTION public.convert_unit_factor(
  from_unit text, to_unit text, density_g_per_ml numeric DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  fu text := lower(trim(coalesce(from_unit,'')));
  tu text := lower(trim(coalesce(to_unit,'')));
  w_g numeric; w_g_to numeric;
  v_ml numeric; v_ml_to numeric;
  c_each numeric; c_each_to numeric;
BEGIN
  IF fu = '' OR tu = '' THEN RETURN NULL; END IF;
  IF fu = tu THEN RETURN 1; END IF;

  -- Weight (grams)
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

  -- Volume (ml)
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
    WHEN 'pinch' THEN 0.31 WHEN 'pinches' THEN 0.31
    WHEN 'dash' THEN 0.62 WHEN 'dashes' THEN 0.62
    WHEN 'drop' THEN 0.05 WHEN 'drops' THEN 0.05
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
    WHEN 'pinch' THEN 0.31 WHEN 'pinches' THEN 0.31
    WHEN 'dash' THEN 0.62 WHEN 'dashes' THEN 0.62
    WHEN 'drop' THEN 0.05 WHEN 'drops' THEN 0.05
    ELSE NULL END;

  -- Count-based (treated as "each" 1:1)
  c_each := CASE fu
    WHEN 'each' THEN 1 WHEN 'ea' THEN 1
    WHEN 'piece' THEN 1 WHEN 'pieces' THEN 1 WHEN 'pc' THEN 1 WHEN 'pcs' THEN 1
    WHEN 'unit' THEN 1 WHEN 'units' THEN 1
    WHEN 'whole' THEN 1
    WHEN 'clove' THEN 1 WHEN 'cloves' THEN 1
    WHEN 'slice' THEN 1 WHEN 'slices' THEN 1
    WHEN 'bunch' THEN 1 WHEN 'bunches' THEN 1
    WHEN 'sprig' THEN 1 WHEN 'sprigs' THEN 1
    WHEN 'head' THEN 1 WHEN 'heads' THEN 1
    WHEN 'stick' THEN 1 WHEN 'sticks' THEN 1
    WHEN 'leaf' THEN 1 WHEN 'leaves' THEN 1
    WHEN 'ear' THEN 1 WHEN 'ears' THEN 1
    WHEN 'stalk' THEN 1 WHEN 'stalks' THEN 1
    WHEN 'sheet' THEN 1 WHEN 'sheets' THEN 1
    WHEN 'pkg' THEN 1 WHEN 'package' THEN 1 WHEN 'packages' THEN 1
    WHEN 'can' THEN 1 WHEN 'cans' THEN 1
    WHEN 'jar' THEN 1 WHEN 'jars' THEN 1
    WHEN 'bottle' THEN 1 WHEN 'bottles' THEN 1
    WHEN 'box' THEN 1 WHEN 'boxes' THEN 1
    WHEN 'bag' THEN 1 WHEN 'bags' THEN 1
    ELSE NULL END;
  c_each_to := CASE tu
    WHEN 'each' THEN 1 WHEN 'ea' THEN 1
    WHEN 'piece' THEN 1 WHEN 'pieces' THEN 1 WHEN 'pc' THEN 1 WHEN 'pcs' THEN 1
    WHEN 'unit' THEN 1 WHEN 'units' THEN 1
    WHEN 'whole' THEN 1
    WHEN 'clove' THEN 1 WHEN 'cloves' THEN 1
    WHEN 'slice' THEN 1 WHEN 'slices' THEN 1
    WHEN 'bunch' THEN 1 WHEN 'bunches' THEN 1
    WHEN 'sprig' THEN 1 WHEN 'sprigs' THEN 1
    WHEN 'head' THEN 1 WHEN 'heads' THEN 1
    WHEN 'stick' THEN 1 WHEN 'sticks' THEN 1
    WHEN 'leaf' THEN 1 WHEN 'leaves' THEN 1
    WHEN 'ear' THEN 1 WHEN 'ears' THEN 1
    WHEN 'stalk' THEN 1 WHEN 'stalks' THEN 1
    WHEN 'sheet' THEN 1 WHEN 'sheets' THEN 1
    WHEN 'pkg' THEN 1 WHEN 'package' THEN 1 WHEN 'packages' THEN 1
    WHEN 'can' THEN 1 WHEN 'cans' THEN 1
    WHEN 'jar' THEN 1 WHEN 'jars' THEN 1
    WHEN 'bottle' THEN 1 WHEN 'bottles' THEN 1
    WHEN 'box' THEN 1 WHEN 'boxes' THEN 1
    WHEN 'bag' THEN 1 WHEN 'bags' THEN 1
    ELSE NULL END;

  IF w_g IS NOT NULL AND w_g_to IS NOT NULL THEN RETURN w_g / w_g_to; END IF;
  IF v_ml IS NOT NULL AND v_ml_to IS NOT NULL THEN RETURN v_ml / v_ml_to; END IF;
  IF c_each IS NOT NULL AND c_each_to IS NOT NULL THEN RETURN c_each / c_each_to; END IF;
  IF w_g IS NOT NULL AND v_ml_to IS NOT NULL AND density_g_per_ml IS NOT NULL AND density_g_per_ml > 0 THEN
    RETURN (w_g / density_g_per_ml) / v_ml_to;
  END IF;
  IF v_ml IS NOT NULL AND w_g_to IS NOT NULL AND density_g_per_ml IS NOT NULL AND density_g_per_ml > 0 THEN
    RETURN (v_ml * density_g_per_ml) / w_g_to;
  END IF;
  RETURN NULL;
END;
$$;

-- Recompute all recipe costs with the expanded converter
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM recipes LOOP
    PERFORM public.recompute_recipe_cost(r.id);
  END LOOP;
END $$;