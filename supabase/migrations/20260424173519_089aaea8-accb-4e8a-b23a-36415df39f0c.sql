
DO $$ BEGIN
  CREATE TYPE quote_state AS ENUM ('initiated','info_collected','structured','awaiting_pricing');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_state quote_state NOT NULL DEFAULT 'awaiting_pricing';

CREATE INDEX IF NOT EXISTS quotes_is_test_idx ON public.quotes (is_test);
CREATE INDEX IF NOT EXISTS quotes_quote_state_idx ON public.quotes (quote_state);
