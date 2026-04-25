ALTER TABLE public.lead_outreach_log
  ADD COLUMN IF NOT EXISTS attempt smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_attempts smallint NOT NULL DEFAULT 3;

ALTER TABLE public.lead_outreach_log
  DROP CONSTRAINT IF EXISTS local_catering_outreach_log_status_check;

ALTER TABLE public.lead_outreach_log
  ADD CONSTRAINT local_catering_outreach_log_status_check
  CHECK (status = ANY (ARRAY['queued','sent','failed','skipped','bounced','retrying']));