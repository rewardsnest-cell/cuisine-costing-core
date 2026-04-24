-- Collections
CREATE TABLE public.cooking_lab_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  hero_image_url text,
  display_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.cooking_lab_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view visible collections"
  ON public.cooking_lab_collections FOR SELECT
  TO anon, authenticated
  USING (visible = true);

CREATE POLICY "Admins and marketing manage collections"
  ON public.cooking_lab_collections FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));

CREATE TRIGGER update_cooking_lab_collections_updated_at
  BEFORE UPDATE ON public.cooking_lab_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Join table (many-to-many)
CREATE TABLE public.cooking_lab_entry_collections (
  entry_id uuid NOT NULL REFERENCES public.cooking_lab_entries(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.cooking_lab_collections(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, collection_id)
);

CREATE INDEX idx_clec_collection ON public.cooking_lab_entry_collections(collection_id);
CREATE INDEX idx_clec_entry ON public.cooking_lab_entry_collections(entry_id);

ALTER TABLE public.cooking_lab_entry_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view entry-collection links"
  ON public.cooking_lab_entry_collections FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins and marketing manage entry-collection links"
  ON public.cooking_lab_entry_collections FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));

-- Seed
INSERT INTO public.cooking_lab_collections (slug, name, description, display_order) VALUES
  ('30-min-meals', '30-Min Meals', 'Fast techniques and recipes you can pull off in half an hour or less.', 1),
  ('budget-staples', 'Budget Staples', 'Pantry-driven cooking that stretches every dollar without sacrificing flavor.', 2);
