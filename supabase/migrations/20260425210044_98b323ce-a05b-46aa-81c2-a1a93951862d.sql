REVOKE EXECUTE ON FUNCTION public.ensure_pricing_v2_initialized() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ensure_access_initialized() FROM anon, public;

-- Add admin-only guard at the top of each function. Re-define with the guard.
CREATE OR REPLACE FUNCTION public.ensure_pricing_v2_initialized()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invocation uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_settings_created boolean := false;
  v_bootstrap_created boolean := false;
  v_stages_created int := 0;
  v_stages_existed int := 0;
  v_errors int := 0;
  v_default_store text;
  r record;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pricing_v2_settings WHERE id = 1) THEN
      INSERT INTO public.pricing_v2_settings (id) VALUES (1);
      v_settings_created := true;
      INSERT INTO public.pricing_v2_init_log
        (invocation_id, actor_user_id, scope, action, target_table, target_key, payload, status)
      VALUES (v_invocation, v_actor, 'pricing_v2', 'seed_settings',
              'pricing_v2_settings', '1', jsonb_build_object('id', 1), 'ok');
    ELSE
      INSERT INTO public.pricing_v2_init_log
        (invocation_id, actor_user_id, scope, action, target_table, target_key, status)
      VALUES (v_invocation, v_actor, 'pricing_v2', 'noop',
              'pricing_v2_settings', '1', 'skipped');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors + 1;
    INSERT INTO public.pricing_v2_init_log
      (invocation_id, actor_user_id, scope, action, target_table, status, error_message)
    VALUES (v_invocation, v_actor, 'pricing_v2', 'seed_settings',
            'pricing_v2_settings', 'error', SQLERRM);
  END;

  SELECT kroger_store_id INTO v_default_store
  FROM public.pricing_v2_settings WHERE id = 1;

  BEGIN
    IF v_default_store IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pricing_v2_catalog_bootstrap_state
      WHERE store_id = v_default_store
    ) THEN
      INSERT INTO public.pricing_v2_catalog_bootstrap_state (store_id, status, total_items_fetched)
      VALUES (v_default_store, 'NOT_STARTED', 0);
      v_bootstrap_created := true;
      INSERT INTO public.pricing_v2_init_log
        (invocation_id, actor_user_id, scope, action, target_table, target_key, payload, status)
      VALUES (v_invocation, v_actor, 'pricing_v2', 'seed_bootstrap',
              'pricing_v2_catalog_bootstrap_state', v_default_store,
              jsonb_build_object('status', 'NOT_STARTED'), 'ok');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors + 1;
    INSERT INTO public.pricing_v2_init_log
      (invocation_id, actor_user_id, scope, action, target_table, target_key, status, error_message)
    VALUES (v_invocation, v_actor, 'pricing_v2', 'seed_bootstrap',
            'pricing_v2_catalog_bootstrap_state', v_default_store, 'error', SQLERRM);
  END;

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
    BEGIN
      IF EXISTS (SELECT 1 FROM public.pricing_v2_pipeline_stages WHERE stage_key = r.stage_key) THEN
        v_stages_existed := v_stages_existed + 1;
      ELSE
        INSERT INTO public.pricing_v2_pipeline_stages (stage_key, label, description, sort_order)
        VALUES (r.stage_key, r.label, r.description, r.sort_order);
        v_stages_created := v_stages_created + 1;
        INSERT INTO public.pricing_v2_init_log
          (invocation_id, actor_user_id, scope, action, target_table, target_key, payload, status)
        VALUES (v_invocation, v_actor, 'pricing_v2', 'seed_stage',
                'pricing_v2_pipeline_stages', r.stage_key,
                jsonb_build_object('label', r.label, 'sort_order', r.sort_order), 'ok');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      INSERT INTO public.pricing_v2_init_log
        (invocation_id, actor_user_id, scope, action, target_table, target_key, status, error_message)
      VALUES (v_invocation, v_actor, 'pricing_v2', 'seed_stage',
              'pricing_v2_pipeline_stages', r.stage_key, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'invocation_id',     v_invocation,
    'settings_created',  v_settings_created,
    'bootstrap_created', v_bootstrap_created,
    'store_id',          v_default_store,
    'stages_created',    v_stages_created,
    'stages_existed',    v_stages_existed,
    'errors',            v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_pricing_v2_initialized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_pricing_v2_initialized() TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_access_initialized()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invocation uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_created int := 0;
  v_errors int := 0;
  v_role text;
  v_section text;
  v_roles text[] := ARRAY['user','employee','social_media','sales'];
  v_sections text[] := ARRAY['quotes','hosting_events','assigned_events','receipts','profile'];
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  FOREACH v_role IN ARRAY v_roles LOOP
    FOREACH v_section IN ARRAY v_sections LOOP
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM public.role_section_permissions
          WHERE role::text = v_role AND section::text = v_section
        ) THEN
          INSERT INTO public.role_section_permissions (role, section, enabled)
          VALUES (v_role::app_role, v_section::section_key, false);
          v_created := v_created + 1;
          INSERT INTO public.pricing_v2_init_log
            (invocation_id, actor_user_id, scope, action, target_table, target_key, payload, status)
          VALUES (v_invocation, v_actor, 'access', 'seed_permission',
                  'role_section_permissions', v_role || ':' || v_section,
                  jsonb_build_object('role', v_role, 'section', v_section, 'enabled', false), 'ok');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors + 1;
        INSERT INTO public.pricing_v2_init_log
          (invocation_id, actor_user_id, scope, action, target_table, target_key, status, error_message)
        VALUES (v_invocation, v_actor, 'access', 'seed_permission',
                'role_section_permissions', v_role || ':' || v_section, 'error', SQLERRM);
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'invocation_id', v_invocation,
    'created',       v_created,
    'errors',        v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_access_initialized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_access_initialized() TO authenticated;