-- Add AI/SEO fields to recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS feed_summary text,
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_inputs jsonb,
  ADD COLUMN IF NOT EXISTS ai_generation_meta jsonb;

-- Tool suggestions
CREATE TABLE IF NOT EXISTS public.recipe_tool_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','added','dismissed')),
  affiliate_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_tool_suggestions_recipe ON public.recipe_tool_suggestions(recipe_id);

ALTER TABLE public.recipe_tool_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tool suggestions"
ON public.recipe_tool_suggestions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert tool suggestions"
ON public.recipe_tool_suggestions FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tool suggestions"
ON public.recipe_tool_suggestions FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tool suggestions"
ON public.recipe_tool_suggestions FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_recipe_tool_suggestions_updated_at
BEFORE UPDATE ON public.recipe_tool_suggestions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private bucket for admin reference uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-ai-uploads', 'recipe-ai-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can read recipe-ai-uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'recipe-ai-uploads' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload to recipe-ai-uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recipe-ai-uploads' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update recipe-ai-uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'recipe-ai-uploads' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete recipe-ai-uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'recipe-ai-uploads' AND public.has_role(auth.uid(), 'admin'));