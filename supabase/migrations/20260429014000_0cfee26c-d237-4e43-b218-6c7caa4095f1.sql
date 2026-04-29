
-- Custom unit synonyms for the pricing engine unit normalizer & CSV importer
CREATE TABLE public.pe_unit_synonyms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  synonym TEXT NOT NULL,
  canonical TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('weight','volume','count')),
  factor NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (synonym)
);

CREATE INDEX idx_pe_unit_synonyms_synonym ON public.pe_unit_synonyms (lower(synonym));

ALTER TABLE public.pe_unit_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read unit synonyms"
ON public.pe_unit_synonyms FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage unit synonyms"
ON public.pe_unit_synonyms FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pe_unit_synonyms_updated_at
BEFORE UPDATE ON public.pe_unit_synonyms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
