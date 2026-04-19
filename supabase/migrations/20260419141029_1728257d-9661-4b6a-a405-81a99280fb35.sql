CREATE TABLE public.national_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  price numeric NOT NULL CHECK (price >= 0),
  unit text NOT NULL,
  region text,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (ingredient_id, region, month, source)
);

CREATE INDEX idx_nps_ingredient_month ON public.national_price_snapshots (ingredient_id, month);
CREATE INDEX idx_nps_month ON public.national_price_snapshots (month);

ALTER TABLE public.national_price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage national price snapshots"
  ON public.national_price_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read national price snapshots"
  ON public.national_price_snapshots
  FOR SELECT TO authenticated
  USING (true);