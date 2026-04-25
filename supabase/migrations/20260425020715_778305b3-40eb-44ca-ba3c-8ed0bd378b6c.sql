ALTER TABLE public.user_downloads
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS record_count integer,
  ADD COLUMN IF NOT EXISTS generated_by_email text,
  ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_downloads_module ON public.user_downloads(module);