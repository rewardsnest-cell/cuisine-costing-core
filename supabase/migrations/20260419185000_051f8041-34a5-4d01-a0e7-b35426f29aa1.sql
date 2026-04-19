
-- Extend recipes with hub fields
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_embed_html text,
  ADD COLUMN IF NOT EXISTS hook text,
  ADD COLUMN IF NOT EXISTS skill_level text,
  ADD COLUMN IF NOT EXISTS use_case text,
  ADD COLUMN IF NOT EXISTS pro_tips jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS serving_suggestions text,
  ADD COLUMN IF NOT EXISTS storage_instructions text,
  ADD COLUMN IF NOT EXISTS reheating_instructions text,
  ADD COLUMN IF NOT EXISTS cta_type text,
  ADD COLUMN IF NOT EXISTS score_affiliate smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_video smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_event smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_seasonal smallint NOT NULL DEFAULT 0;

-- Shop This Recipe items (affiliate module)
CREATE TABLE IF NOT EXISTS public.recipe_shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  benefit text,
  url text,
  image_url text,
  program_id uuid REFERENCES public.affiliate_programs(id) ON DELETE SET NULL,
  is_affiliate boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_shop_items_recipe ON public.recipe_shop_items(recipe_id, position);

ALTER TABLE public.recipe_shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shop items"
  ON public.recipe_shop_items FOR SELECT
  USING (true);

CREATE POLICY "Admins manage shop items"
  ON public.recipe_shop_items FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_recipe_shop_items_updated_at
  BEFORE UPDATE ON public.recipe_shop_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
