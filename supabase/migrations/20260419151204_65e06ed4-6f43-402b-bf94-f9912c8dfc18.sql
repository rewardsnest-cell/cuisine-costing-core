
-- Staging table for previewing national prices before activation
CREATE TABLE IF NOT EXISTS public.national_price_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredient_reference(id) ON DELETE CASCADE,
  price numeric NOT NULL CHECK (price >= 0),
  unit text NOT NULL,
  region text,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ingredient_id, region, month, source)
);

CREATE INDEX IF NOT EXISTS idx_nps_staging_month ON public.national_price_staging(month);

ALTER TABLE public.national_price_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage national price staging"
  ON public.national_price_staging FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read national price staging"
  ON public.national_price_staging FOR SELECT
  TO authenticated
  USING (true);

-- Key/value settings store (separate from existing typed app_settings singleton)
CREATE TABLE IF NOT EXISTS public.app_kv (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_kv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage app_kv"
  ON public.app_kv FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read app_kv"
  ON public.app_kv FOR SELECT
  TO authenticated
  USING (true);

-- Seed default for active national price month (NULL = none active)
INSERT INTO public.app_kv (key, value) VALUES ('active_national_price_month', NULL)
  ON CONFLICT (key) DO NOTHING;
