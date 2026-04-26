
-- ============================================================================
-- PRICING V2 — STAGES 4/5/6 SCHEMA
-- ============================================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE pricing_v2_inventory_status AS ENUM ('OK', 'DEGRADED_FALLBACK', 'BLOCKED_MISSING_COST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_v2_recipe_status AS ENUM ('OK', 'WARNING', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_v2_menu_status AS ENUM ('OK', 'WARNING', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_v2_resolution_source AS ENUM ('signals', 'explicit_equivalence', 'last_approved', 'category_median');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_v2_queue_status AS ENUM ('pending', 'approved', 'rejected', 'auto_applied', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Inventory item additions
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS cost_per_gram_live numeric,
  ADD COLUMN IF NOT EXISTS last_approved_cost_per_gram numeric,
  ADD COLUMN IF NOT EXISTS pricing_status pricing_v2_inventory_status NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS cost_equivalent_of uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS category_for_median text;

CREATE INDEX IF NOT EXISTS idx_inventory_pricing_status
  ON public.inventory_items (pricing_status)
  WHERE pricing_status <> 'OK';

-- 3. Settings additions
ALTER TABLE public.pricing_v2_settings
  ADD COLUMN IF NOT EXISTS auto_apply_threshold_pct numeric NOT NULL DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS enable_category_median_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stage456_cron_enabled boolean NOT NULL DEFAULT true;

-- 4. Cost signals (Stage 3 output, used as Stage 4 input)
CREATE TABLE IF NOT EXISTS public.pricing_v2_cost_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  cost_per_gram numeric NOT NULL CHECK (cost_per_gram > 0),
  source text NOT NULL,                 -- 'kroger_catalog' | 'receipt' | 'manual' | etc.
  source_ref text,                      -- e.g. kroger_product_id, receipt id
  observed_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv2_signals_item ON public.pricing_v2_cost_signals (inventory_item_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_pv2_signals_observed ON public.pricing_v2_cost_signals (observed_at DESC);

ALTER TABLE public.pricing_v2_cost_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pv2 cost signals" ON public.pricing_v2_cost_signals
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Cost update queue
CREATE TABLE IF NOT EXISTS public.pricing_v2_cost_update_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  old_cost_per_gram numeric,
  new_computed_cost_per_gram numeric NOT NULL CHECK (new_computed_cost_per_gram > 0),
  resolution_source pricing_v2_resolution_source NOT NULL,
  pct_change numeric,
  requires_review boolean NOT NULL DEFAULT false,
  warning_flags text[] NOT NULL DEFAULT '{}',
  status pricing_v2_queue_status NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_notes text,
  signals_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv2_queue_status ON public.pricing_v2_cost_update_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_queue_item ON public.pricing_v2_cost_update_queue (inventory_item_id);

ALTER TABLE public.pricing_v2_cost_update_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pv2 cost queue" ON public.pricing_v2_cost_update_queue
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. Cost apply audit log
CREATE TABLE IF NOT EXISTS public.pricing_v2_cost_apply_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.pricing_v2_cost_update_queue(id) ON DELETE SET NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  old_cost_per_gram numeric,
  new_cost_per_gram numeric NOT NULL,
  resolution_source pricing_v2_resolution_source NOT NULL,
  pct_change numeric,
  applied_by uuid,
  applied_via text NOT NULL CHECK (applied_via IN ('auto', 'manual')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv2_apply_item ON public.pricing_v2_cost_apply_log (inventory_item_id, created_at DESC);

ALTER TABLE public.pricing_v2_cost_apply_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pv2 apply log" ON public.pricing_v2_cost_apply_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write pv2 apply log" ON public.pricing_v2_cost_apply_log
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 7. Recipe cost snapshots (Stage 5 output)
CREATE TABLE IF NOT EXISTS public.pricing_v2_recipe_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL,
  total_cost numeric,
  cost_per_serving numeric,
  servings integer NOT NULL,
  status pricing_v2_recipe_status NOT NULL,
  blocker_reasons text[] NOT NULL DEFAULT '{}',
  warning_flags text[] NOT NULL DEFAULT '{}',
  ingredient_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{name, grams, cost_per_gram, ingredient_cost, source, status}]
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv2_recipe_costs_recipe ON public.pricing_v2_recipe_costs (recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_recipe_costs_current ON public.pricing_v2_recipe_costs (recipe_id) WHERE is_current;

ALTER TABLE public.pricing_v2_recipe_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pv2 recipe costs" ON public.pricing_v2_recipe_costs
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 8. Menu price snapshots (Stage 6 output)
CREATE TABLE IF NOT EXISTS public.pricing_v2_menu_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE CASCADE,
  quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('recipe_menu', 'quote_item')),
  run_id uuid REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL,
  recipe_cost_per_serving numeric,
  multiplier numeric NOT NULL,
  multiplier_source text NOT NULL DEFAULT 'default', -- 'default' | 'override'
  menu_price numeric,
  status pricing_v2_menu_status NOT NULL,
  warning_flags text[] NOT NULL DEFAULT '{}',
  is_current boolean NOT NULL DEFAULT true,
  frozen boolean NOT NULL DEFAULT false, -- true once a quote is sent/accepted
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv2_menu_prices_recipe ON public.pricing_v2_menu_prices (recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_menu_prices_quote ON public.pricing_v2_menu_prices (quote_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv2_menu_prices_current ON public.pricing_v2_menu_prices (scope) WHERE is_current;

ALTER TABLE public.pricing_v2_menu_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pv2 menu prices" ON public.pricing_v2_menu_prices
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
