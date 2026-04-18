CREATE TABLE public.ingredient_synonyms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alias text NOT NULL,
  canonical text NOT NULL,
  alias_normalized text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredient_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ingredient synonyms"
  ON public.ingredient_synonyms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read ingredient synonyms"
  ON public.ingredient_synonyms FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access"
  ON public.ingredient_synonyms FOR SELECT TO anon
  USING (true);

CREATE TRIGGER trg_ingredient_synonyms_updated_at
  BEFORE UPDATE ON public.ingredient_synonyms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();