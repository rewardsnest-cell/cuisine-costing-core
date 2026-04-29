-- 1. Section on quote_items
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'other';

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_section_check;
ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_section_check
  CHECK (section IN ('appetizer','entree','side','dessert','beverage','staffing','rental','other'));

CREATE INDEX IF NOT EXISTS idx_quote_items_section ON public.quote_items(section);

-- 2. Extend quote_state enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='draft' AND enumtypid='quote_state'::regtype) THEN
    ALTER TYPE quote_state ADD VALUE 'draft';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='sent' AND enumtypid='quote_state'::regtype) THEN
    ALTER TYPE quote_state ADD VALUE 'sent';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='expired' AND enumtypid='quote_state'::regtype) THEN
    ALTER TYPE quote_state ADD VALUE 'expired';
  END IF;
END $$;

-- 3. New columns on quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email text,
  ADD COLUMN IF NOT EXISTS expires_at date;

-- Default expires_at on insert (30 days from creation) when not provided
CREATE OR REPLACE FUNCTION public.set_quote_expires_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at::date, CURRENT_DATE) + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_expires_at ON public.quotes;
CREATE TRIGGER trg_set_quote_expires_at
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_quote_expires_at();

-- 4. Helper to mark stale draft/sent quotes as expired
CREATE OR REPLACE FUNCTION public.mark_expired_quotes()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.quotes
     SET quote_state = 'expired'::quote_state,
         updated_at = now()
   WHERE quote_state IN ('draft','sent')
     AND expires_at IS NOT NULL
     AND expires_at < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;