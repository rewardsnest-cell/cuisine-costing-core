-- Extend sales_contact_log to store sent emails with thread tracking
ALTER TABLE public.sales_contact_log
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_preview text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS outlook_message_id text,
  ADD COLUMN IF NOT EXISTS outlook_conversation_id text,
  ADD COLUMN IF NOT EXISTS from_email text,
  ADD COLUMN IF NOT EXISTS to_email text;

ALTER TABLE public.sales_contact_log
  ADD CONSTRAINT sales_contact_log_direction_chk CHECK (direction IN ('inbound','outbound'));

CREATE UNIQUE INDEX IF NOT EXISTS sales_contact_log_outlook_msg_uidx
  ON public.sales_contact_log (outlook_message_id) WHERE outlook_message_id IS NOT NULL;

-- Track latest inbound on the prospect itself for fast Respond-button detection
ALTER TABLE public.sales_prospects
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outlook_conversation_id text;

CREATE INDEX IF NOT EXISTS sales_prospects_email_lower_idx
  ON public.sales_prospects ((lower(email))) WHERE email IS NOT NULL;