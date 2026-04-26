-- Keyword library table
CREATE TABLE IF NOT EXISTS public.pricing_v2_keyword_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  category text,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  last_run_at timestamptz,
  last_hits integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pricing_v2_keyword_library_keyword_lower_uidx
  ON public.pricing_v2_keyword_library (lower(keyword));

CREATE INDEX IF NOT EXISTS pricing_v2_keyword_library_enabled_idx
  ON public.pricing_v2_keyword_library (enabled);

ALTER TABLE public.pricing_v2_keyword_library ENABLE ROW LEVEL SECURITY;

-- Admins only (uses existing has_role pattern)
DROP POLICY IF EXISTS "Admins can view keyword library" ON public.pricing_v2_keyword_library;
CREATE POLICY "Admins can view keyword library"
  ON public.pricing_v2_keyword_library FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert keyword library" ON public.pricing_v2_keyword_library;
CREATE POLICY "Admins can insert keyword library"
  ON public.pricing_v2_keyword_library FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update keyword library" ON public.pricing_v2_keyword_library;
CREATE POLICY "Admins can update keyword library"
  ON public.pricing_v2_keyword_library FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete keyword library" ON public.pricing_v2_keyword_library;
CREATE POLICY "Admins can delete keyword library"
  ON public.pricing_v2_keyword_library FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS update_pricing_v2_keyword_library_updated_at ON public.pricing_v2_keyword_library;
CREATE TRIGGER update_pricing_v2_keyword_library_updated_at
  BEFORE UPDATE ON public.pricing_v2_keyword_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed common grocery keywords
INSERT INTO public.pricing_v2_keyword_library (keyword, category) VALUES
  -- Produce
  ('apple', 'produce'), ('banana', 'produce'), ('orange', 'produce'),
  ('lemon', 'produce'), ('lime', 'produce'), ('strawberry', 'produce'),
  ('blueberry', 'produce'), ('grape', 'produce'), ('avocado', 'produce'),
  ('tomato', 'produce'), ('potato', 'produce'), ('onion', 'produce'),
  ('garlic', 'produce'), ('carrot', 'produce'), ('celery', 'produce'),
  ('lettuce', 'produce'), ('spinach', 'produce'), ('broccoli', 'produce'),
  ('bell pepper', 'produce'), ('cucumber', 'produce'), ('mushroom', 'produce'),
  ('zucchini', 'produce'), ('corn', 'produce'),
  -- Dairy & eggs
  ('milk', 'dairy'), ('butter', 'dairy'), ('cream', 'dairy'),
  ('heavy cream', 'dairy'), ('sour cream', 'dairy'), ('yogurt', 'dairy'),
  ('cheese', 'dairy'), ('cheddar', 'dairy'), ('mozzarella', 'dairy'),
  ('parmesan', 'dairy'), ('cream cheese', 'dairy'), ('eggs', 'dairy'),
  -- Meat & seafood
  ('chicken breast', 'meat'), ('chicken thigh', 'meat'), ('ground beef', 'meat'),
  ('beef steak', 'meat'), ('pork', 'meat'), ('bacon', 'meat'),
  ('sausage', 'meat'), ('ham', 'meat'), ('turkey', 'meat'),
  ('salmon', 'seafood'), ('shrimp', 'seafood'), ('tuna', 'seafood'),
  -- Pantry
  ('flour', 'pantry'), ('sugar', 'pantry'), ('brown sugar', 'pantry'),
  ('powdered sugar', 'pantry'), ('salt', 'pantry'), ('pepper', 'pantry'),
  ('olive oil', 'pantry'), ('vegetable oil', 'pantry'), ('canola oil', 'pantry'),
  ('vinegar', 'pantry'), ('baking soda', 'pantry'), ('baking powder', 'pantry'),
  ('yeast', 'pantry'), ('vanilla extract', 'pantry'), ('cocoa powder', 'pantry'),
  ('honey', 'pantry'), ('maple syrup', 'pantry'), ('soy sauce', 'pantry'),
  ('hot sauce', 'pantry'), ('ketchup', 'pantry'), ('mustard', 'pantry'),
  ('mayonnaise', 'pantry'), ('peanut butter', 'pantry'), ('jam', 'pantry'),
  -- Grains & pasta
  ('rice', 'grains'), ('pasta', 'grains'), ('spaghetti', 'grains'),
  ('bread', 'grains'), ('tortilla', 'grains'), ('oats', 'grains'),
  ('cereal', 'grains'), ('quinoa', 'grains'),
  -- Canned & frozen
  ('canned tomatoes', 'canned'), ('chicken broth', 'canned'),
  ('beef broth', 'canned'), ('beans', 'canned'), ('black beans', 'canned'),
  ('corn frozen', 'frozen'), ('frozen pizza', 'frozen'),
  -- Beverages
  ('coffee', 'beverage'), ('tea', 'beverage'), ('orange juice', 'beverage'),
  ('soda', 'beverage'), ('water', 'beverage')
ON CONFLICT DO NOTHING;