-- 1. Fix inventory units & cost: Balsamic Vinegar (was $6.99/bottle, now $0.41/oz assuming 17oz bottle)
UPDATE public.inventory_items
SET unit = 'oz', average_cost_per_unit = 0.41, updated_at = now()
WHERE id = '2cb39bb5-2abc-422a-96dc-cfa7a4c40b62';

-- 2. Fix inventory units & cost: Extra Virgin Olive Oil (was $8.99/liter; 33.8 oz/L => $0.27/oz)
UPDATE public.inventory_items
SET unit = 'oz', average_cost_per_unit = 0.27, updated_at = now()
WHERE id = '8e5f2236-08fc-4626-bb47-321523c715c5';

-- 3. Bump Caprese Salad servings 1 -> 8
UPDATE public.recipes
SET servings = 8, updated_at = now()
WHERE id = '84626764-d951-4daf-a406-901b21638560';

-- 4. Recompute every active recipe's cost so cached cost_per_serving refreshes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.recipes WHERE active = true LOOP
    PERFORM public.recompute_recipe_cost(r.id);
  END LOOP;
END $$;