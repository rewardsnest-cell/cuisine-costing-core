-- Daily Kroger price ingest cron (4:30 AM UTC = ~12:30 AM ET).
-- Calls the public hook with mode=daily_update; the hook is a no-op when
-- the feature flag is disabled or keys are missing.
SELECT cron.unschedule('kroger-daily-ingest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kroger-daily-ingest');

SELECT cron.schedule(
  'kroger-daily-ingest',
  '30 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--5912085f-f53d-4d75-a0e6-646a46b82539.lovable.app/api/public/hooks/kroger-daily-ingest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6eG5kYWJ4a3pocGxoc3Bra29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDA1MjcsImV4cCI6MjA5MTg3NjUyN30.HShb7MH_rfptpMN6v7Ty7OMZ9kJmNUdMFdyUE9VT_KU"}'::jsonb,
    body := '{"mode": "daily_update"}'::jsonb
  ) AS request_id;
  $$
);