CREATE TABLE public.local_catering_outreach_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.local_catering_contacts(id) ON DELETE CASCADE,

  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','call','walk-in','text','other')),
  template_name TEXT,
  recipient_email TEXT,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','skipped','bounced')),
  message_id TEXT,
  error_message TEXT,
  notes TEXT,

  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lcc_outreach_contact ON public.local_catering_outreach_log(contact_id);
CREATE INDEX idx_lcc_outreach_sent_at ON public.local_catering_outreach_log(sent_at DESC);
CREATE INDEX idx_lcc_outreach_message_id ON public.local_catering_outreach_log(message_id);

ALTER TABLE public.local_catering_outreach_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage local catering outreach log"
ON public.local_catering_outreach_log
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_local_catering_outreach_log_updated_at
BEFORE UPDATE ON public.local_catering_outreach_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-bump parent contact's last_outreach_date when a successful outreach is logged
CREATE OR REPLACE FUNCTION public.bump_local_catering_last_outreach()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('sent','queued') THEN
    UPDATE public.local_catering_contacts
       SET last_outreach_date = GREATEST(COALESCE(last_outreach_date, NEW.sent_at::date), NEW.sent_at::date),
           first_outreach_date = COALESCE(first_outreach_date, NEW.sent_at::date),
           last_channel = NEW.channel,
           updated_at = now()
     WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_local_catering_last_outreach
AFTER INSERT ON public.local_catering_outreach_log
FOR EACH ROW
EXECUTE FUNCTION public.bump_local_catering_last_outreach();