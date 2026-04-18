CREATE OR REPLACE FUNCTION public.normalize_ingredient_name(_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(lower(coalesce(_name,'')), '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.convert_unit_factor(
  from_unit text, to_unit text, density_g_per_ml numeric DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
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