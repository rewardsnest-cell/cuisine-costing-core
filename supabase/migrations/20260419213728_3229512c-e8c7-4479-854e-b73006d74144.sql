ALTER TABLE public.sale_flyer_items
  ADD COLUMN IF NOT EXISTS flipp_image_url text,
  ADD COLUMN IF NOT EXISTS flipp_short_link text,
  ADD COLUMN IF NOT EXISTS flipp_generated_at timestamptz;

ALTER TABLE public.sale_flyers
  ADD COLUMN IF NOT EXISTS flipp_image_url text,
  ADD COLUMN IF NOT EXISTS flipp_short_link text,
  ADD COLUMN IF NOT EXISTS flipp_generated_at timestamptz;

-- Public coupon pages need read access to active sale flyer items
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='sale_flyer_items' AND policyname='Anyone can view sale flyer items'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can view sale flyer items" ON public.sale_flyer_items FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='sale_flyers' AND policyname='Anyone can view sale flyers'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can view sale flyers" ON public.sale_flyers FOR SELECT USING (true)';
  END IF;
END $$;