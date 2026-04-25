
-- Lead email thread (sent + received via Outlook)
CREATE TABLE public.lead_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  outlook_message_id TEXT UNIQUE,
  outlook_conversation_id TEXT,
  internet_message_id TEXT,
  in_reply_to TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  cc_emails TEXT[] DEFAULT '{}',
  subject TEXT,
  body_preview TEXT,
  body_html TEXT,
  body_text TEXT,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT FALSE,
  template_name TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_emails_lead_id ON public.lead_emails(lead_id);
CREATE INDEX idx_lead_emails_conversation ON public.lead_emails(outlook_conversation_id);
CREATE INDEX idx_lead_emails_from ON public.lead_emails(lower(from_email));
CREATE INDEX idx_lead_emails_received_at ON public.lead_emails(received_at DESC);

ALTER TABLE public.lead_emails ENABLE ROW LEVEL SECURITY;

-- Admins read everything; service role writes via cron/server functions
CREATE POLICY "Admins can view lead emails"
  ON public.lead_emails FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert lead emails"
  ON public.lead_emails FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update lead emails (e.g. relink)"
  ON public.lead_emails FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Track Outlook inbox poll state (delta token, last poll time)
CREATE TABLE public.outlook_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_polled_at TIMESTAMPTZ,
  last_message_received_at TIMESTAMPTZ,
  delta_link TEXT,
  total_messages_synced INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.outlook_sync_state (id) VALUES (1);

ALTER TABLE public.outlook_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view outlook sync state"
  ON public.outlook_sync_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
