CREATE TABLE public.ingredient_synonym_dismissed (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alias_normalized text NOT NULL UNIQUE,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredient_synonym_dismissed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage dismissed synonyms"
  ON public.ingredient_synonym_dismissed FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));