ALTER TABLE public.sales_contact_log
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS internet_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_contact_log_internet_msg
  ON public.sales_contact_log(internet_message_id)
  WHERE internet_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_contact_log_conversation
  ON public.sales_contact_log(outlook_conversation_id)
  WHERE outlook_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_contact_log_prospect_time
  ON public.sales_contact_log(prospect_id, contacted_at DESC);