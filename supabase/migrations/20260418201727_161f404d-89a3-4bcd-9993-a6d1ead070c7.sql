ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS menu_price numeric,
  ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;