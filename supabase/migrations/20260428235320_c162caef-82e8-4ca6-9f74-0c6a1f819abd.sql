-- VPSFinest Pricing Engine v3 — single source of truth
-- Tables: pe_ingredients, pe_ingredient_aliases, pe_ingredient_prices, pe_price_history, pe_price_overrides_audit

-- 1) Canonical ingredients
CREATE TABLE IF NOT EXISTS public.pe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,
  base_unit text NOT NULL CHECK (base_unit IN ('lb','oz','g','kg','ml','l','each','tbsp','tsp','cup','fl oz')),
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Aliases / synonyms
CREATE TABLE IF NOT EXISTS public.pe_ingredient_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.pe_ingredients(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias)
);
CREATE INDEX IF NOT EXISTS idx_pe_aliases_ing ON public.pe_ingredient_aliases(ingredient_id);

-- 3) Cached ingredient prices (one row per ingredient — current price)
CREATE TABLE IF NOT EXISTS public.pe_ingredient_prices (
  ingredient_id uuid PRIMARY KEY REFERENCES public.pe_ingredients(id) ON DELETE CASCADE,
  price_per_base_unit numeric(12,6),
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'grocery_pricing_api',
  raw_sample_json jsonb,
  discovered_field_path text,
  confidence_score numeric(4,3),
  is_manual_override boolean NOT NULL DEFAULT false,
  override_note text,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','price_missing','stale','error')),
  last_error text,
  last_updated timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Append-only price history
CREATE TABLE IF NOT EXISTS public.pe_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.pe_ingredients(id) ON DELETE CASCADE,
  price_per_base_unit numeric(12,6),
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL,
  discovered_field_path text,
  confidence_score numeric(4,3),
  is_manual_override boolean NOT NULL DEFAULT false,
  override_note text,
  changed_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pe_price_hist_ing_time ON public.pe_price_history(ingredient_id, recorded_at DESC);

-- 5) Manual override audit log
CREATE TABLE IF NOT EXISTS public.pe_price_overrides_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.pe_ingredients(id) ON DELETE CASCADE,
  previous_price numeric(12,6),
  new_price numeric(12,6),
  note text NOT NULL,
  admin_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers (reuse existing function if present)
DROP TRIGGER IF EXISTS pe_ingredients_updated_at ON public.pe_ingredients;
CREATE TRIGGER pe_ingredients_updated_at BEFORE UPDATE ON public.pe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS pe_ingredient_prices_updated_at ON public.pe_ingredient_prices;
CREATE TRIGGER pe_ingredient_prices_updated_at BEFORE UPDATE ON public.pe_ingredient_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — admin-only via existing has_role()
ALTER TABLE public.pe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_ingredient_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_ingredient_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_price_overrides_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pe_ingredients admin all" ON public.pe_ingredients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pe_aliases admin all" ON public.pe_ingredient_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pe_prices admin all" ON public.pe_ingredient_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pe_price_history admin read" ON public.pe_price_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pe_price_history admin insert" ON public.pe_price_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pe_overrides_audit admin read" ON public.pe_price_overrides_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pe_overrides_audit admin insert" ON public.pe_price_overrides_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_user_id = auth.uid());