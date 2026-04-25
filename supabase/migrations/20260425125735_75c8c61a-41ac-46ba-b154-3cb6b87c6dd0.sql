-- =========================================================
-- Kroger Nightly Validation System
-- =========================================================

CREATE TABLE IF NOT EXISTS public.kroger_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- running | success | error
  triggered_by text,
  missing_zip_count int NOT NULL DEFAULT 0,
  outlier_median_count int NOT NULL DEFAULT 0,
  failed_refresh_count int NOT NULL DEFAULT 0,
  total_anomalies int NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kroger_validation_runs_started_idx
  ON public.kroger_validation_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.kroger_validation_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.kroger_validation_runs(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'missing_zip' | 'outlier_median' | 'failed_refresh'
  severity text NOT NULL DEFAULT 'warning', -- info | warning | error
  subject_type text, -- 'zip' | 'ingredient_reference' | 'kroger_ingest_run'
  subject_id text,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kroger_validation_anomalies_run_idx
  ON public.kroger_validation_anomalies (run_id, category);
CREATE INDEX IF NOT EXISTS kroger_validation_anomalies_created_idx
  ON public.kroger_validation_anomalies (created_at DESC);

ALTER TABLE public.kroger_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kroger_validation_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read validation runs" ON public.kroger_validation_runs;
CREATE POLICY "admins read validation runs"
  ON public.kroger_validation_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins read validation anomalies" ON public.kroger_validation_anomalies;
CREATE POLICY "admins read validation anomalies"
  ON public.kroger_validation_anomalies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Validation routine
-- =========================================================
CREATE OR REPLACE FUNCTION public.run_kroger_validation(
  _triggered_by text DEFAULT 'cron'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_missing int := 0;
  v_outlier int := 0;
  v_failed  int := 0;
BEGIN
  INSERT INTO public.kroger_validation_runs (triggered_by, status)
  VALUES (_triggered_by, 'running')
  RETURNING id INTO v_run_id;

  -- 1) Missing ZIP -> Kroger locationId mappings
  --    ZIPs referenced by leads/quotes that have no cached app_kv entry.
  WITH used_zips AS (
    SELECT DISTINCT regexp_replace(address_zip, '\s+', '', 'g') AS zip
    FROM public.leads
    WHERE address_zip IS NOT NULL AND length(trim(address_zip)) >= 5
    UNION
    SELECT DISTINCT regexp_replace(l.address_zip, '\s+', '', 'g')
    FROM public.quotes q
    JOIN public.leads l ON l.id = q.lead_id
    WHERE l.address_zip IS NOT NULL AND length(trim(l.address_zip)) >= 5
  ),
  missing AS (
    SELECT uz.zip
    FROM used_zips uz
    LEFT JOIN public.app_kv kv
      ON kv.key = 'kroger_location_for_zip:' || uz.zip
    WHERE uz.zip IS NOT NULL
      AND uz.zip <> ''
      AND (kv.value IS NULL OR kv.value = '' OR kv.value = 'null')
  )
  INSERT INTO public.kroger_validation_anomalies
    (run_id, category, severity, subject_type, subject_id, message, details)
  SELECT
    v_run_id, 'missing_zip', 'warning', 'zip', m.zip,
    'No cached Kroger locationId for ZIP ' || m.zip,
    jsonb_build_object('zip', m.zip)
  FROM missing m;
  GET DIAGNOSTICS v_missing = ROW_COUNT;

  -- 2) Outlier median calculations
  --    Compare today's smoothed median vs the median ~24h prior, plus
  --    flag high volatility ingredients.
  WITH latest AS (
    SELECT
      ir.id,
      ir.canonical_name,
      ir.kroger_signal_median AS today_median,
      ir.kroger_signal_volatility AS volatility,
      ir.kroger_signal_updated_at
    FROM public.ingredient_reference ir
    WHERE ir.kroger_signal_median IS NOT NULL
      AND ir.kroger_signal_median > 0
      AND ir.kroger_signal_updated_at > now() - interval '2 days'
  ),
  prior AS (
    SELECT
      ph.inventory_item_id,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ph.unit_price) AS prior_median
    FROM public.price_history ph
    WHERE ph.source = 'kroger'
      AND ph.promo = false
      AND ph.observed_at >= now() - interval '31 days'
      AND ph.observed_at <  now() - interval '1 day'
    GROUP BY ph.inventory_item_id
  ),
  ref_to_item AS (
    SELECT ir.id AS reference_id, ii.id AS inventory_item_id
    FROM public.ingredient_reference ir
    JOIN public.inventory_items ii ON ii.reference_id = ir.id
  ),
  joined AS (
    SELECT
      l.id AS reference_id,
      l.canonical_name,
      l.today_median,
      l.volatility,
      AVG(p.prior_median) AS prior_median
    FROM latest l
    LEFT JOIN ref_to_item r ON r.reference_id = l.id
    LEFT JOIN prior p ON p.inventory_item_id = r.inventory_item_id
    GROUP BY l.id, l.canonical_name, l.today_median, l.volatility
  )
  INSERT INTO public.kroger_validation_anomalies
    (run_id, category, severity, subject_type, subject_id, message, details)
  SELECT
    v_run_id,
    'outlier_median',
    CASE
      WHEN j.prior_median IS NOT NULL
       AND abs(j.today_median - j.prior_median) / NULLIF(j.prior_median, 0) > 0.40
        THEN 'error'
      ELSE 'warning'
    END,
    'ingredient_reference',
    j.reference_id::text,
    CASE
      WHEN j.prior_median IS NOT NULL
       AND abs(j.today_median - j.prior_median) / NULLIF(j.prior_median, 0) > 0.40
        THEN COALESCE(j.canonical_name,'(unnamed)')
             || ': median changed '
             || round(((j.today_median - j.prior_median) / j.prior_median * 100)::numeric, 1)::text
             || '% (prior ' || round(j.prior_median::numeric, 4)::text
             || ' → ' || round(j.today_median::numeric, 4)::text || ')'
      ELSE COALESCE(j.canonical_name,'(unnamed)')
             || ': high volatility '
             || round((j.volatility * 100)::numeric, 1)::text || '%'
    END,
    jsonb_build_object(
      'reference_id', j.reference_id,
      'name', j.canonical_name,
      'today_median', j.today_median,
      'prior_median', j.prior_median,
      'volatility', j.volatility,
      'pct_change',
        CASE WHEN j.prior_median IS NOT NULL AND j.prior_median <> 0
             THEN (j.today_median - j.prior_median) / j.prior_median
             ELSE NULL END
    )
  FROM joined j
  WHERE
    (j.prior_median IS NOT NULL
     AND abs(j.today_median - j.prior_median) / NULLIF(j.prior_median, 0) > 0.40)
    OR (j.volatility IS NOT NULL AND j.volatility > 0.35);
  GET DIAGNOSTICS v_outlier = ROW_COUNT;

  -- 3) Failed refresh / ingest runs in the last 24h
  INSERT INTO public.kroger_validation_anomalies
    (run_id, category, severity, subject_type, subject_id, message, details)
  SELECT
    v_run_id,
    'failed_refresh',
    'error',
    'kroger_ingest_run',
    r.id::text,
    'Kroger ingest run failed: ' || COALESCE(r.message, '(no message)'),
    jsonb_build_object(
      'started_at', r.started_at,
      'finished_at', r.finished_at,
      'status', r.status,
      'message', r.message,
      'errors', r.errors,
      'location_id', r.location_id
    )
  FROM public.kroger_ingest_runs r
  WHERE r.started_at > now() - interval '24 hours'
    AND r.status IN ('error', 'failed');
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  UPDATE public.kroger_validation_runs
  SET finished_at = now(),
      status = 'success',
      missing_zip_count = v_missing,
      outlier_median_count = v_outlier,
      failed_refresh_count = v_failed,
      total_anomalies = v_missing + v_outlier + v_failed,
      message = format('missing=%s outlier=%s failed=%s', v_missing, v_outlier, v_failed)
  WHERE id = v_run_id;

  RETURN v_run_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.kroger_validation_runs
  SET finished_at = now(),
      status = 'error',
      message = SQLERRM
  WHERE id = v_run_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.run_kroger_validation(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_kroger_validation(text) TO service_role;

-- =========================================================
-- Admin-facing read functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_kroger_validation_summary(
  _limit int DEFAULT 30
)
RETURNS TABLE(
  id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  status text,
  triggered_by text,
  missing_zip_count int,
  outlier_median_count int,
  failed_refresh_count int,
  total_anomalies int,
  message text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN QUERY
  SELECT r.id, r.started_at, r.finished_at, r.status, r.triggered_by,
         r.missing_zip_count, r.outlier_median_count,
         r.failed_refresh_count, r.total_anomalies, r.message
  FROM public.kroger_validation_runs r
  ORDER BY r.started_at DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_kroger_validation_anomalies(
  _run_id uuid DEFAULT NULL,
  _category text DEFAULT NULL,
  _limit int DEFAULT 500
)
RETURNS TABLE(
  id uuid,
  run_id uuid,
  category text,
  severity text,
  subject_type text,
  subject_id text,
  message text,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run uuid := _run_id;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF v_run IS NULL THEN
    SELECT id INTO v_run FROM public.kroger_validation_runs
    ORDER BY started_at DESC LIMIT 1;
  END IF;
  RETURN QUERY
  SELECT a.id, a.run_id, a.category, a.severity, a.subject_type,
         a.subject_id, a.message, a.details, a.created_at
  FROM public.kroger_validation_anomalies a
  WHERE a.run_id = v_run
    AND (_category IS NULL OR a.category = _category)
  ORDER BY
    CASE a.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    a.created_at DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_kroger_validation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  v_id := public.run_kroger_validation('admin_manual');
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_kroger_validation_summary(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kroger_validation_anomalies(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_kroger_validation() TO authenticated;