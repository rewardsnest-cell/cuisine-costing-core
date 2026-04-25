-- Admin-only access to cron run history via SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.admin_cron_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN QUERY
    SELECT j.jobid, j.jobname, j.schedule, j.active
    FROM cron.job j
    ORDER BY j.jobname;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cron_runs(
  _job_name text DEFAULT NULL,
  _status text DEFAULT NULL,
  _since timestamptz DEFAULT (now() - interval '90 days'),
  _limit int DEFAULT 500,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  runid bigint,
  jobid bigint,
  jobname text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz,
  duration_ms numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN QUERY
    SELECT r.runid, r.jobid, j.jobname, r.status, r.return_message,
           r.start_time, r.end_time,
           EXTRACT(EPOCH FROM (r.end_time - r.start_time)) * 1000
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE r.start_time >= _since
      AND (_job_name IS NULL OR j.jobname = _job_name)
      AND (_status IS NULL OR r.status = _status)
    ORDER BY r.start_time DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cron_summary(
  _since timestamptz DEFAULT (now() - interval '90 days')
)
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  total_runs bigint,
  succeeded bigint,
  failed bigint,
  other bigint,
  last_run timestamptz,
  last_status text,
  last_message text,
  avg_duration_ms numeric,
  failures_24h bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN QUERY
  WITH runs AS (
    SELECT r.jobid, r.status, r.return_message, r.start_time, r.end_time
    FROM cron.job_run_details r
    WHERE r.start_time >= _since
  ),
  agg AS (
    SELECT jobid,
      COUNT(*) AS total_runs,
      COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE status NOT IN ('succeeded','failed')) AS other,
      AVG(EXTRACT(EPOCH FROM (end_time - start_time)) * 1000) AS avg_duration_ms,
      COUNT(*) FILTER (WHERE status = 'failed' AND start_time >= now() - interval '24 hours') AS failures_24h
    FROM runs
    GROUP BY jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (r.jobid) r.jobid, r.status, r.return_message, r.start_time
    FROM runs r
    ORDER BY r.jobid, r.start_time DESC
  )
  SELECT j.jobid, j.jobname, j.schedule, j.active,
         COALESCE(agg.total_runs, 0),
         COALESCE(agg.succeeded, 0),
         COALESCE(agg.failed, 0),
         COALESCE(agg.other, 0),
         lr.start_time,
         lr.status,
         lr.return_message,
         agg.avg_duration_ms,
         COALESCE(agg.failures_24h, 0)
  FROM cron.job j
  LEFT JOIN agg ON agg.jobid = j.jobid
  LEFT JOIN last_run lr ON lr.jobid = j.jobid
  ORDER BY j.jobname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_runs(text, text, timestamptz, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_summary(timestamptz) TO authenticated;