-- 1. Add location fields to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS location_name TEXT,
  ADD COLUMN IF NOT EXISTS location_address TEXT;

-- 2. app_settings table (single-row pattern)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  revision_lock_days INTEGER NOT NULL DEFAULT 7,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO public.app_settings (id, revision_lock_days)
VALUES (1, 7)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Public can read settings"
ON public.app_settings FOR SELECT
TO anon
USING (true);

CREATE POLICY "Admins can update settings"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Tighten quote update policy: enforce revision lock for non-admins
-- Existing policies allow auth.uid()=user_id and public update; we add a stricter check via trigger
CREATE OR REPLACE FUNCTION public.enforce_quote_revision_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_days INTEGER;
  cutoff DATE;
BEGIN
  -- Admins bypass entirely
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Allow status/internal changes to pass without checking date when no event_date
  IF NEW.event_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT revision_lock_days INTO lock_days FROM public.app_settings WHERE id = 1;
  lock_days := COALESCE(lock_days, 7);
  cutoff := NEW.event_date - lock_days;

  IF CURRENT_DATE > cutoff THEN
    RAISE EXCEPTION 'Quote can no longer be revised (locked % days before event date)', lock_days
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_revision_lock ON public.quotes;
CREATE TRIGGER quotes_revision_lock
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_quote_revision_lock();