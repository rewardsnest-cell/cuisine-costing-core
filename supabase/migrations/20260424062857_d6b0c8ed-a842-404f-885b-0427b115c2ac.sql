CREATE TABLE IF NOT EXISTS public.cooking_lab_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  video_url text,
  image_url text,
  primary_tool_name text,
  primary_tool_url text,
  secondary_tool_name text,
  secondary_tool_url text,
  display_order integer NOT NULL DEFAULT 0,
  qa_copy_reviewed boolean NOT NULL DEFAULT false,
  qa_video_loads boolean NOT NULL DEFAULT false,
  qa_image_loads boolean NOT NULL DEFAULT false,
  qa_links_tested boolean NOT NULL DEFAULT false,
  qa_ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_cooking_lab_entries_order ON public.cooking_lab_entries(display_order);
CREATE INDEX IF NOT EXISTS idx_cooking_lab_entries_visible ON public.cooking_lab_entries(visible, status);

ALTER TABLE public.cooking_lab_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published cooking lab entries"
  ON public.cooking_lab_entries
  FOR SELECT
  TO anon, authenticated
  USING (visible = true AND status = 'published');

CREATE POLICY "Admins and marketing manage cooking lab entries"
  ON public.cooking_lab_entries
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing'::app_role));

CREATE TRIGGER update_cooking_lab_entries_updated_at
  BEFORE UPDATE ON public.cooking_lab_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cooking_lab_entries
  (visible, status, title, description, video_url, image_url, primary_tool_name, primary_tool_url, secondary_tool_name, secondary_tool_url, display_order)
VALUES
  (false, 'draft', 'Homemade Mayonnaise', 'Turn oil and an egg yolk into silky mayo in under two minutes.', '', '', 'Immersion Blender', 'https://www.amazon.com/', 'Wide-Mouth Jar', 'https://www.amazon.com/', 1),
  (false, 'draft', 'Sous Vide Cooking', 'Cook proteins to the exact doneness you want, every single time.', '', '', 'Sous Vide Circulator', 'https://www.amazon.com/', 'Vacuum Sealer', 'https://www.amazon.com/', 2),
  (false, 'draft', 'Flash Freezing', 'Lock in shape and texture so frozen ingredients cook like fresh.', '', '', 'Sheet Pan', 'https://www.amazon.com/', 'Silicone Mat', 'https://www.amazon.com/', 3),
  (false, 'draft', 'Fresh Pasta', 'Eggs, flour, and ten quiet minutes — restaurant pasta at home.', '', '', 'Pasta Roller', 'https://www.amazon.com/', 'Bench Scraper', 'https://www.amazon.com/', 4);

INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes)
VALUES ('cooking_lab', 'public', true, true, 'Public Cooking Lab marketing page')
ON CONFLICT (feature_key) DO NOTHING;