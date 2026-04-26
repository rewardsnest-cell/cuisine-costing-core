CREATE OR REPLACE VIEW public.v_files_reports_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COALESCE(module, 'other') AS module,
  kind,
  COUNT(*)::int AS file_count,
  COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes,
  COALESCE(SUM(record_count), 0)::bigint AS total_records,
  COUNT(DISTINCT generated_by_email)::int AS unique_generators
FROM public.user_downloads
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.v_files_reports_daily IS
  'Daily rollup of generated files by module/kind, used by Files & Reports admin page.';