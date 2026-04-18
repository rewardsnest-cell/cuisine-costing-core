CREATE TABLE IF NOT EXISTS public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text NOT NULL,
  website text,
  phone text,
  email text,
  notes text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competitors_name_normalized_key UNIQUE (name_normalized)
);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage competitors"
  ON public.competitors FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read competitors"
  ON public.competitors FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.competitor_quotes
  ADD COLUMN IF NOT EXISTS competitor_id uuid REFERENCES public.competitors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_competitor_quotes_competitor_id
  ON public.competitor_quotes (competitor_id);

-- Auto-upsert competitor on insert/update of competitor_quotes
CREATE OR REPLACE FUNCTION public.upsert_competitor_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
  cid uuid;
BEGIN
  IF NEW.competitor_name IS NULL OR length(trim(NEW.competitor_name)) = 0 THEN
    RETURN NEW;
  END IF;

  norm := lower(regexp_replace(trim(NEW.competitor_name), '\s+', ' ', 'g'));

  INSERT INTO public.competitors (name, name_normalized, last_seen_at)
  VALUES (trim(NEW.competitor_name), norm, now())
  ON CONFLICT (name_normalized) DO UPDATE
    SET last_seen_at = now(),
        updated_at = now()
  RETURNING id INTO cid;

  NEW.competitor_id := cid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_competitor_from_quote ON public.competitor_quotes;
CREATE TRIGGER trg_upsert_competitor_from_quote
  BEFORE INSERT OR UPDATE OF competitor_name ON public.competitor_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.upsert_competitor_from_quote();

-- Backfill existing rows
INSERT INTO public.competitors (name, name_normalized, first_seen_at, last_seen_at)
SELECT
  trim(competitor_name) as name,
  lower(regexp_replace(trim(competitor_name), '\s+', ' ', 'g')) as norm,
  min(created_at), max(created_at)
FROM public.competitor_quotes
WHERE competitor_name IS NOT NULL AND length(trim(competitor_name)) > 0
GROUP BY 1, 2
ON CONFLICT (name_normalized) DO NOTHING;

UPDATE public.competitor_quotes cq
SET competitor_id = c.id
FROM public.competitors c
WHERE cq.competitor_id IS NULL
  AND cq.competitor_name IS NOT NULL
  AND lower(regexp_replace(trim(cq.competitor_name), '\s+', ' ', 'g')) = c.name_normalized;