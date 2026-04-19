-- 1. FRED series mapping (seeded defaults + admin-editable)
CREATE TABLE IF NOT EXISTS public.fred_series_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  match_keywords TEXT[] NOT NULL DEFAULT '{}',
  unit TEXT NOT NULL DEFAULT 'lb',
  unit_conversion NUMERIC NOT NULL DEFAULT 1.0,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fred_series_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read fred series map"
ON public.fred_series_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage fred series map"
ON public.fred_series_map FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_fred_series_map_updated
BEFORE UPDATE ON public.fred_series_map
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Per-ingredient overrides
ALTER TABLE public.ingredient_reference
  ADD COLUMN IF NOT EXISTS fred_series_id TEXT,
  ADD COLUMN IF NOT EXISTS fred_unit TEXT;

-- 3. Inventory item provenance + review queue
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS pending_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_source TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_inventory_items_pending_review
  ON public.inventory_items (pending_review) WHERE pending_review = true;

-- 4. Audit log for FRED pulls
CREATE TABLE IF NOT EXISTS public.fred_pull_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pulled_by UUID,
  series_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  applied_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT
);

ALTER TABLE public.fred_pull_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read fred pull log"
ON public.fred_pull_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert fred pull log"
ON public.fred_pull_log FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Seed common FRED series (BLS Average Price Data + CPI Food at Home)
INSERT INTO public.fred_series_map (series_id, label, match_keywords, unit, unit_conversion, category) VALUES
  ('APU0000708111', 'Eggs, Grade A, Large (per dozen)', ARRAY['egg','eggs','large eggs'], 'dozen', 1.0, 'dairy'),
  ('APU0000709112', 'Milk, fresh, whole, fortified (per gallon)', ARRAY['milk','whole milk','fresh milk'], 'gallon', 1.0, 'dairy'),
  ('APU0000710411', 'Butter, salted, grade AA, stick (per lb)', ARRAY['butter','salted butter','unsalted butter'], 'lb', 1.0, 'dairy'),
  ('APU0000FF1101', 'Bread, white, pan (per lb)', ARRAY['bread','white bread','sandwich bread'], 'lb', 1.0, 'bakery'),
  ('APU0000701111', 'Flour, white, all purpose (per lb)', ARRAY['flour','all purpose flour','ap flour','plain flour'], 'lb', 1.0, 'pantry'),
  ('APU0000715211', 'Sugar, white (per lb)', ARRAY['sugar','white sugar','granulated sugar'], 'lb', 1.0, 'pantry'),
  ('APU0000703112', 'Ground beef, 100% beef (per lb)', ARRAY['ground beef','beef mince','hamburger meat'], 'lb', 1.0, 'meat'),
  ('APU0000703613', 'Chicken breast, boneless (per lb)', ARRAY['chicken breast','boneless chicken','chicken breasts'], 'lb', 1.0, 'meat'),
  ('APU0000704111', 'Bacon, sliced (per lb)', ARRAY['bacon','sliced bacon'], 'lb', 1.0, 'meat'),
  ('APU0000FS1101', 'Fish, fresh whole (per lb)', ARRAY['fish','whole fish','fresh fish'], 'lb', 1.0, 'seafood'),
  ('APU0000711211', 'Bananas (per lb)', ARRAY['banana','bananas'], 'lb', 1.0, 'produce'),
  ('APU0000711311', 'Oranges, navel (per lb)', ARRAY['orange','oranges','navel orange'], 'lb', 1.0, 'produce'),
  ('APU0000712112', 'Tomatoes, field grown (per lb)', ARRAY['tomato','tomatoes','field tomato'], 'lb', 1.0, 'produce'),
  ('APU0000712311', 'Lettuce, iceberg (per lb)', ARRAY['lettuce','iceberg lettuce','iceberg'], 'lb', 1.0, 'produce'),
  ('APU0000712401', 'Potatoes, white (per lb)', ARRAY['potato','potatoes','white potato'], 'lb', 1.0, 'produce'),
  ('APU0000712406', 'Onions (per lb)', ARRAY['onion','onions','yellow onion'], 'lb', 1.0, 'produce'),
  ('APU0000717311', 'Coffee, 100% ground roast (per lb)', ARRAY['coffee','ground coffee','coffee beans'], 'lb', 1.0, 'beverages'),
  ('APU0000FJ1101', 'Orange juice, frozen concentrate (per 16 oz)', ARRAY['orange juice','oj','frozen orange juice'], 'each', 1.0, 'beverages'),
  ('APU0000702421', 'Rice, white, long grain, uncooked (per lb)', ARRAY['rice','white rice','long grain rice'], 'lb', 1.0, 'pantry'),
  ('APU0000FF1101', 'Cheese, cheddar (per lb)', ARRAY['cheese','cheddar','cheddar cheese'], 'lb', 1.0, 'dairy'),
  ('CUSR0000SAF11', 'CPI: Food at Home (index)', ARRAY['__cpi_food_at_home__'], 'index', 1.0, 'index')
ON CONFLICT (series_id) DO NOTHING;