-- Brand configuration: single-row source of truth for brand name + colors
CREATE TABLE public.brand_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name text NOT NULL DEFAULT 'VPSFinest',
  brand_display_name text NOT NULL DEFAULT 'VPS Finest',
  primary_color text,
  secondary_color text,
  accent_color text,
  background_color text,
  text_color text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.brand_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read brand config"
  ON public.brand_config FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins update brand config"
  ON public.brand_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert brand config"
  ON public.brand_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- History table for revertible changes + audit trail
CREATE TABLE public.brand_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  brand_display_name text NOT NULL,
  primary_color text,
  secondary_color text,
  accent_color text,
  background_color text,
  text_color text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  change_note text
);

ALTER TABLE public.brand_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read brand history"
  ON public.brand_config_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert brand history"
  ON public.brand_config_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Snapshot every change (insert + update) into history
CREATE OR REPLACE FUNCTION public.trg_brand_config_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.brand_config_history (
    brand_name, brand_display_name,
    primary_color, secondary_color, accent_color, background_color, text_color,
    changed_by
  ) VALUES (
    NEW.brand_name, NEW.brand_display_name,
    NEW.primary_color, NEW.secondary_color, NEW.accent_color, NEW.background_color, NEW.text_color,
    auth.uid()
  );
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER brand_config_snapshot
  BEFORE INSERT OR UPDATE ON public.brand_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_brand_config_snapshot();

-- Seed singleton
INSERT INTO public.brand_config (id, brand_name, brand_display_name)
  VALUES (1, 'VPSFinest', 'VPS Finest')
  ON CONFLICT (id) DO NOTHING;