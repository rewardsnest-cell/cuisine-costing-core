-- Add status + auto-generation tracking to change_log_entries
ALTER TABLE public.change_log_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false;

-- Backfill: existing manually-authored entries are 'published'
UPDATE public.change_log_entries SET status = 'published' WHERE status IS NULL OR status = '';

-- Constrain status values via trigger (avoid CHECK for future flexibility)
CREATE OR REPLACE FUNCTION public.validate_change_log_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_change_log_status_trigger ON public.change_log_entries;
CREATE TRIGGER validate_change_log_status_trigger
BEFORE INSERT OR UPDATE ON public.change_log_entries
FOR EACH ROW
EXECUTE FUNCTION public.validate_change_log_status();

CREATE INDEX IF NOT EXISTS idx_change_log_entries_status ON public.change_log_entries(status);
CREATE INDEX IF NOT EXISTS idx_change_log_entries_auto_gen ON public.change_log_entries(auto_generated);