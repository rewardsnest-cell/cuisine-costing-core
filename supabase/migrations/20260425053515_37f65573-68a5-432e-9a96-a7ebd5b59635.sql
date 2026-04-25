-- Per-day idempotency for catering follow-up emails:
-- Guarantee at most one outbound email per (lead, template) per UTC day.
CREATE UNIQUE INDEX IF NOT EXISTS lead_emails_daily_stage_unique
  ON public.lead_emails (lead_id, template_name, ((sent_at AT TIME ZONE 'UTC')::date))
  WHERE direction = 'outbound' AND template_name IS NOT NULL AND lead_id IS NOT NULL;