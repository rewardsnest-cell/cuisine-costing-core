ALTER TABLE public.pricing_v2_recipe_costs
  ADD COLUMN IF NOT EXISTS contributing_inventory_item_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE public.pricing_v2_menu_prices
  ADD COLUMN IF NOT EXISTS contributing_inventory_item_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_pricing_v2_recipe_costs_contrib_inv
  ON public.pricing_v2_recipe_costs USING GIN (contributing_inventory_item_ids);

CREATE INDEX IF NOT EXISTS idx_pricing_v2_menu_prices_contrib_inv
  ON public.pricing_v2_menu_prices USING GIN (contributing_inventory_item_ids);

COMMENT ON COLUMN public.pricing_v2_recipe_costs.contributing_inventory_item_ids IS
  'Inventory items whose cost_per_gram contributed to this recipe cost snapshot.';
COMMENT ON COLUMN public.pricing_v2_menu_prices.contributing_inventory_item_ids IS
  'Inventory items that ultimately contributed (via the recipe) to this menu price.';