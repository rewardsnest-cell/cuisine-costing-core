-- Storage bucket for compose attachments (public read; uploads gated via RLS).
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-email-attachments', 'lead-email-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admins can upload/read/delete; everyone can read (bucket is public).
CREATE POLICY "Admins can upload lead email attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lead-email-attachments'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can read lead email attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lead-email-attachments'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete lead email attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'lead-email-attachments'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Public can read lead email attachments"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'lead-email-attachments');

-- Per-attachment row tied to a logged email send.
CREATE TABLE public.lead_email_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_email_id UUID REFERENCES public.lead_emails(id) ON DELETE CASCADE,
  lead_id UUID,
  storage_bucket TEXT NOT NULL DEFAULT 'lead-email-attachments',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  outlook_attachment_id TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_email_attachments_email_id
  ON public.lead_email_attachments(lead_email_id);
CREATE INDEX idx_lead_email_attachments_lead_id
  ON public.lead_email_attachments(lead_id);

ALTER TABLE public.lead_email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lead email attachments"
ON public.lead_email_attachments FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert lead email attachments"
ON public.lead_email_attachments FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete lead email attachments"
ON public.lead_email_attachments FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));