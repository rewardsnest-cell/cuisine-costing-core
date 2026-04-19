ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS coupon_image_url text,
  ADD COLUMN IF NOT EXISTS coupon_text text,
  ADD COLUMN IF NOT EXISTS coupon_valid_until date;

ALTER TABLE public.sale_flyer_items
  ADD COLUMN IF NOT EXISTS promo_image_url text;