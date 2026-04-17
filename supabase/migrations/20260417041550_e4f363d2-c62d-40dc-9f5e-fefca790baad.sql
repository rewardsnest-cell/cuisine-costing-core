ALTER TABLE public.event_time_entries
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_notes text;

ALTER TABLE public.event_time_entries
  DROP CONSTRAINT IF EXISTS event_time_entries_approval_status_check;
ALTER TABLE public.event_time_entries
  ADD CONSTRAINT event_time_entries_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'disputed'));

-- Prevent non-admin employees from changing approval fields
CREATE OR REPLACE FUNCTION public.enforce_time_entry_approval_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approval_notes IS DISTINCT FROM OLD.approval_notes THEN
    RAISE EXCEPTION 'Only admins can change approval fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entry_approval_immutable ON public.event_time_entries;
CREATE TRIGGER trg_time_entry_approval_immutable
  BEFORE UPDATE ON public.event_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_time_entry_approval_immutable();