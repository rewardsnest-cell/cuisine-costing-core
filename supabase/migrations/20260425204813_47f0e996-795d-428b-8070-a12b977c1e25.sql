-- =========================================================================
-- Pricing v2 Pipeline Stage Registry
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pricing_v2_pipeline_stages (
  stage_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_v2_pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage pipeline stages" ON public.pricing_v2_pipeline_stages;
CREATE POLICY "Admins can manage pipeline stages"
  ON public.pricing_v2_pipeline_stages
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- ensure_pricing_v2_initialized()
-- Idempotent server-side bootstrap for Pricing v2. Single transaction.
-- Returns a JSONB summary of what was created vs already-existing.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ensure_pricing_v2_initialized()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_created boolean := false;
  v_bootstrap_created boolean := false;
  v_stages_created int := 0;
  v_stages_existed int := 0;
  v_default_store text;
  r record;
BEGIN
  -- 1) Settings row (singleton id=1)
  IF NOT EXISTS (SELECT 1 FROM public.pricing_v2_settings WHERE id = 1) THEN
    INSERT INTO public.pricing_v2_settings (id) VALUES (1);
    v_settings_created := true;
  END IF;

  SELECT kroger_store_id INTO v_default_store
  FROM public.pricing_v2_settings WHERE id = 1;

  -- 2) Bootstrap state for current store
  IF NOT EXISTS (
    SELECT 1 FROM public.pricing_v2_catalog_bootstrap_state
    WHERE store_id = v_default_store
  ) THEN
    INSERT INTO public.pricing_v2_catalog_bootstrap_state (store_id, status, total_items_fetched)
    VALUES (v_default_store, 'NOT_STARTED', 0);
    v_bootstrap_created := true;
  END IF;

  -- 3) Pipeline stage registry
  FOR r IN
    SELECT * FROM (VALUES
      ('recipe_weight_normalization', 'Stage -1 — Recipe Weight Normalization', 'Convert all recipe ingredients to grams. Required prerequisite.', -1),
      ('catalog_bootstrap',           'Stage 0 — Catalog Bootstrap',            'One-time download of full Kroger catalog for the configured store.', 0),
      ('monthly_snapshot',            'Stage 1 — Monthly Snapshot',             'Pull current Kroger prices for tracked items (monthly).', 1),
      ('receipt_ingest',              'Stage 2 — Receipt Ingest',               'Continuously ingest receipt line items.', 2),
      ('normalize_costs',             'Stage 3 — Normalize to cost_per_gram',   'Convert all observed prices to cost-per-gram.', 3),
      ('compute_costs',               'Stage 4 — Compute Costs + Warnings',     'Compute rolling avg cost and flag >=10% / zero changes.', 4),
      ('rollup_recipes',              'Stage 5 — Recipe Rollup',                'Roll up ingredient costs to recipe costs.', 5),
      ('rollup_menus',                'Stage 6 — Menu Rollup',                  'Roll up recipe costs to menu costs.', 6)
    ) AS t(stage_key, label, description, sort_order)
  LOOP
    IF EXISTS (SELECT 1 FROM public.pricing_v2_pipeline_stages WHERE stage_key = r.stage_key) THEN
      v_stages_existed := v_stages_existed + 1;
    ELSE
      INSERT INTO public.pricing_v2_pipeline_stages (stage_key, label, description, sort_order)
      VALUES (r.stage_key, r.label, r.description, r.sort_order);
      v_stages_created := v_stages_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'settings_created',  v_settings_created,
    'bootstrap_created', v_bootstrap_created,
    'store_id',          v_default_store,
    'stages_created',    v_stages_created,
    'stages_existed',    v_stages_existed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_pricing_v2_initialized() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_pricing_v2_initialized() TO authenticated;

-- =========================================================================
-- ensure_access_initialized()
-- Idempotent server-side seed for role × section permissions.
-- Replaces the browser-side useEffect seeding loop in /admin/access.
-- All non-admin combos default to OFF; admin is implicit (no rows needed).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ensure_access_initialized()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created int := 0;
  v_role text;
  v_section text;
  v_roles text[] := ARRAY['user','employee','social_media','sales'];
  v_sections text[] := ARRAY['quotes','hosting_events','assigned_events','receipts','profile'];
BEGIN
  FOREACH v_role IN ARRAY v_roles LOOP
    FOREACH v_section IN ARRAY v_sections LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.role_section_permissions
        WHERE role::text = v_role AND section::text = v_section
      ) THEN
        BEGIN
          INSERT INTO public.role_section_permissions (role, section, enabled)
          VALUES (v_role::app_role, v_section::section_key, false);
          v_created := v_created + 1;
        EXCEPTION WHEN OTHERS THEN
          -- Skip rows whose enum cast fails (defensive)
          NULL;
        END;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_access_initialized() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_access_initialized() TO authenticated;