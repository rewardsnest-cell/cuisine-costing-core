ALTER TABLE public.cooking_lab_entries
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_canonical_url text,
  ADD COLUMN IF NOT EXISTS seo_og_image_url text;