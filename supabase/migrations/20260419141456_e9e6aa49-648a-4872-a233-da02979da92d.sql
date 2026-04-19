ALTER TABLE public.national_price_snapshots
  DROP CONSTRAINT IF EXISTS national_price_snapshots_ingredient_id_fkey;

ALTER TABLE public.national_price_snapshots
  DROP CONSTRAINT IF EXISTS national_price_snapshots_ingredient_id_region_month_source_key;

DROP INDEX IF EXISTS public.idx_nps_ingredient_month;

ALTER TABLE public.national_price_snapshots
  ADD CONSTRAINT national_price_snapshots_ingredient_id_fkey
  FOREIGN KEY (ingredient_id) REFERENCES public.ingredient_reference(id) ON DELETE CASCADE;

ALTER TABLE public.national_price_snapshots
  ADD CONSTRAINT national_price_snapshots_ingredient_region_month_source_key
  UNIQUE (ingredient_id, region, month, source);

CREATE INDEX idx_nps_ingredient_month ON public.national_price_snapshots (ingredient_id, month);