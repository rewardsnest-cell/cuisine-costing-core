CREATE TABLE public.lead_email_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_email_id UUID REFERENCES public.lead_emails(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  template_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  http_status INTEGER,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  actor_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_email_audit_lead ON public.lead_email_audit(lead_id, attempted_at DESC);
CREATE INDEX idx_lead_email_audit_status ON public.lead_email_audit(status, attempted_at DESC);
CREATE INDEX idx_lead_email_audit_attempted_at ON public.lead_email_audit(attempted_at DESC);

ALTER TABLE public.lead_email_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lead email audit"
  ON public.lead_email_audit FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert lead email audit"
  ON public.lead_email_audit FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));