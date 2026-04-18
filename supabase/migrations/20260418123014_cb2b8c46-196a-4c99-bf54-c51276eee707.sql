ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS markup_multiplier numeric NOT NULL DEFAULT 3.0;

INSERT INTO public.app_settings (id, revision_lock_days, markup_multiplier)
VALUES (1, 7, 3.0)
ON CONFLICT (id) DO NOTHING;