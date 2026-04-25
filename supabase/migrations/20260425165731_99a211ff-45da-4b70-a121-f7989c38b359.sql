-- Archive legacy pricing system: move tables to archive schema, make them read-only.
-- No data is deleted. All legacy pricing objects remain queryable for reference
-- via the service role / superuser only; authenticated/anon roles cannot read or write.

CREATE SCHEMA IF NOT EXISTS archive;

COMMENT ON SCHEMA archive IS
  'Legacy pricing system (v1). Read-only. Do not reference from runtime code. See /docs/pricing-archive.md.';

-- Move every legacy pricing table out of public into archive.
-- Order chosen so dependent objects move first where possible.
DO $$
DECLARE
  t text;
  legacy_tables text[] := ARRAY[
    'kroger_bootstrap_progress',
    'kroger_validation_anomalies',
    'kroger_validation_runs',
    'kroger_ingest_runs',
    'kroger_sku_map',
    'fred_pull_log',
    'fred_series_map',
    'national_price_staging',
    'national_price_snapshots',
    'pricing_model_recipes',
    'pricing_models',
    'price_history',
    'cost_update_queue'
  ];
BEGIN
  FOREACH t IN ARRAY legacy_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive', t);
      EXECUTE format('REVOKE ALL ON archive.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('ALTER TABLE archive.%I DISABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'COMMENT ON TABLE archive.%I IS %L',
        t,
        'ARCHIVED legacy pricing v1 table. Read-only. Do not query from runtime code.'
      );
    END IF;
  END LOOP;
END $$;

-- Belt and suspenders: revoke any default grants on the archive schema itself.
REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA archive TO postgres, service_role;
