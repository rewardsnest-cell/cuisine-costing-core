-- 1) Customer fields on the event row.
ALTER TABLE public.cqh_events
  ADD COLUMN IF NOT EXISTS customer_name        text,
  ADD COLUMN IF NOT EXISTS customer_email       text,
  ADD COLUMN IF NOT EXISTS customer_phone       text,
  ADD COLUMN IF NOT EXISTS customer_org         text,
  ADD COLUMN IF NOT EXISTS billing_address      text,
  ADD COLUMN IF NOT EXISTS customer_notes       text,
  ADD COLUMN IF NOT EXISTS event_location_name  text,
  ADD COLUMN IF NOT EXISTS event_location_addr  text;

CREATE INDEX IF NOT EXISTS idx_cqh_events_customer_email
  ON public.cqh_events (lower(customer_email))
  WHERE customer_email IS NOT NULL;

-- 2) Extend quote_state with workflow stages.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='approved' AND enumtypid='quote_state'::regtype) THEN
    ALTER TYPE quote_state ADD VALUE 'approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='invoiced' AND enumtypid='quote_state'::regtype) THEN
    ALTER TYPE quote_state ADD VALUE 'invoiced';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='paid' AND enumtypid='quote_state'::regtype) THEN
    ALTER TYPE quote_state ADD VALUE 'paid';
  END IF;
END $$;

-- 3) Trigger: every NEW quote must link to an event (legacy rows untouched).
CREATE OR REPLACE FUNCTION public.enforce_quote_event_link()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cqh_event_id IS NULL THEN
    RAISE EXCEPTION 'Quotes must be linked to an event (cqh_event_id is required).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_quote_event_link ON public.quotes;
CREATE TRIGGER trg_enforce_quote_event_link
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_event_link();

-- 4) invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  text UNIQUE,
  quote_id        uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  cqh_event_id   uuid NOT NULL REFERENCES public.cqh_events(id) ON DELETE RESTRICT,
  issue_date      date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  subtotal        numeric NOT NULL DEFAULT 0,
  tax_rate        numeric NOT NULL DEFAULT 0.08,
  tax_amount      numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,
  amount_paid     numeric NOT NULL DEFAULT 0,
  balance_due     numeric GENERATED ALWAYS AS (total - amount_paid) STORED,
  status          text NOT NULL DEFAULT 'unpaid',  -- unpaid|partial|paid|void
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_quote   ON public.invoices(quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_event   ON public.invoices(cqh_event_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON public.invoices(status);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  quantity     numeric NOT NULL DEFAULT 1,
  unit_price   numeric NOT NULL DEFAULT 0,
  total_price  numeric NOT NULL DEFAULT 0,
  source_quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE SET NULL,
  position     integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- 5) customer_payment_receipts
CREATE TABLE IF NOT EXISTS public.customer_payment_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number  text UNIQUE,
  invoice_id      uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  quote_id        uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  cqh_event_id   uuid NOT NULL REFERENCES public.cqh_events(id) ON DELETE RESTRICT,
  paid_at         timestamptz NOT NULL DEFAULT now(),
  amount          numeric NOT NULL,
  payment_method  text,           -- cash|card|check|wire|other
  reference_note  text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpr_invoice ON public.customer_payment_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cpr_event   ON public.customer_payment_receipts(cqh_event_id);
CREATE INDEX IF NOT EXISTS idx_cpr_quote   ON public.customer_payment_receipts(quote_id);

-- 6) Triggers: invoice gates + immutable links.
CREATE OR REPLACE FUNCTION public.enforce_invoice_from_approved_quote()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  q_state public.quote_state;
  q_event uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT quote_state, cqh_event_id INTO q_state, q_event
      FROM public.quotes WHERE id = NEW.quote_id;
    IF q_state IS NULL THEN
      RAISE EXCEPTION 'Quote % not found', NEW.quote_id USING ERRCODE='foreign_key_violation';
    END IF;
    IF q_state <> 'approved' THEN
      RAISE EXCEPTION 'Cannot create invoice: quote % is %, must be approved', NEW.quote_id, q_state
        USING ERRCODE='check_violation';
    END IF;
    IF q_event IS NULL OR q_event <> NEW.cqh_event_id THEN
      RAISE EXCEPTION 'Invoice event_id must match the source quote event_id'
        USING ERRCODE='check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quote_id <> OLD.quote_id THEN
      RAISE EXCEPTION 'Invoice quote_id is immutable' USING ERRCODE='check_violation';
    END IF;
    IF NEW.cqh_event_id <> OLD.cqh_event_id THEN
      RAISE EXCEPTION 'Invoice cqh_event_id is immutable' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_from_approved_quote ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_from_approved_quote
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_from_approved_quote();

CREATE OR REPLACE FUNCTION public.touch_invoices_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoices_updated_at();

-- 7) Triggers: receipt gates + immutable links.
CREATE OR REPLACE FUNCTION public.enforce_receipt_from_paid_invoice()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id, quote_id, cqh_event_id, balance_due, status
      INTO inv FROM public.invoices WHERE id = NEW.invoice_id;
    IF inv.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', NEW.invoice_id USING ERRCODE='foreign_key_violation';
    END IF;
    IF inv.balance_due <> 0 OR inv.status <> 'paid' THEN
      RAISE EXCEPTION 'Cannot issue paid receipt: invoice % has balance % and status %',
        NEW.invoice_id, inv.balance_due, inv.status USING ERRCODE='check_violation';
    END IF;
    IF NEW.quote_id <> inv.quote_id OR NEW.cqh_event_id <> inv.cqh_event_id THEN
      RAISE EXCEPTION 'Receipt links must match the invoice (quote_id / cqh_event_id)'
        USING ERRCODE='check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.invoice_id <> OLD.invoice_id
       OR NEW.quote_id <> OLD.quote_id
       OR NEW.cqh_event_id <> OLD.cqh_event_id THEN
      RAISE EXCEPTION 'Receipt links are immutable' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_receipt_from_paid_invoice ON public.customer_payment_receipts;
CREATE TRIGGER trg_enforce_receipt_from_paid_invoice
  BEFORE INSERT OR UPDATE ON public.customer_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_from_paid_invoice();

-- 8) RLS
ALTER TABLE public.invoices                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_receipts  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read invoices"
  ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated can read invoice items"
  ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage invoice items"
  ON public.invoice_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated can read customer receipts"
  ON public.customer_payment_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage customer receipts"
  ON public.customer_payment_receipts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));