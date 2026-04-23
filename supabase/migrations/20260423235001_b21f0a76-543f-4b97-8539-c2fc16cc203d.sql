-- Brand assets table for admin-managed logo URLs
CREATE TABLE public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL CHECK (asset_type IN ('primary_logo', 'light_logo', 'dark_logo', 'favicon')),
  asset_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active asset per type
CREATE UNIQUE INDEX brand_assets_active_type_idx
  ON public.brand_assets (asset_type)
  WHERE active = true;

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

-- Public + authenticated may read (needed to render logos in header/footer for anon visitors)
CREATE POLICY "Anyone can read brand assets"
  ON public.brand_assets
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can write
CREATE POLICY "Admins manage brand assets"
  ON public.brand_assets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Touch updated_at on update
CREATE TRIGGER trg_brand_assets_touch
BEFORE UPDATE ON public.brand_assets
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_updated_at();