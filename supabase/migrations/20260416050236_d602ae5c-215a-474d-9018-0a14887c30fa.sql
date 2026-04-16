
-- Add reference_number column to quotes
ALTER TABLE public.quotes ADD COLUMN reference_number TEXT UNIQUE;

-- Function to generate a short reference number
CREATE OR REPLACE FUNCTION public.generate_quote_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.reference_number := 'TQ-' || UPPER(SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 6));
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate reference number on insert
CREATE TRIGGER set_quote_reference
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_quote_reference();

-- Backfill existing quotes
UPDATE public.quotes SET reference_number = 'TQ-' || UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 6)) WHERE reference_number IS NULL;

-- Allow anyone to look up a quote by reference number
CREATE POLICY "Anyone can view quotes by reference number"
  ON public.quotes
  FOR SELECT
  TO public
  USING (reference_number IS NOT NULL);
