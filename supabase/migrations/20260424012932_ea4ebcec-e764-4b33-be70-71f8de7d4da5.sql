CREATE TABLE public.change_log_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  linked_audit_event_ids UUID[] NOT NULL DEFAULT '{}',
  archived BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMP WITH TIME ZONE,
  author_user_id UUID,
  author_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.change_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read change log"
  ON public.change_log_entries FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert change log"
  ON public.change_log_entries FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update change log"
  ON public.change_log_entries FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Note: no DELETE policy = no one can delete (entries are archived only)

CREATE INDEX idx_change_log_entries_created_at ON public.change_log_entries (created_at DESC);
CREATE INDEX idx_change_log_entries_archived ON public.change_log_entries (archived);

CREATE TRIGGER update_change_log_entries_updated_at
  BEFORE UPDATE ON public.change_log_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();