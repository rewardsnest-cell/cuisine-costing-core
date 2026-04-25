
ALTER TABLE public.sales_prospects
  ADD COLUMN IF NOT EXISTS distance_miles numeric,
  ADD COLUMN IF NOT EXISTS role_department text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS use_cases text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'High',
  ADD COLUMN IF NOT EXISTS last_outreach_date date,
  ADD COLUMN IF NOT EXISTS website text;

CREATE TABLE IF NOT EXISTS public.sales_followup_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES public.sales_prospects(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('day5','day14')),
  scheduled_for date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prospect_id, step)
);

CREATE INDEX IF NOT EXISTS idx_sales_followup_queue_due ON public.sales_followup_queue (status, scheduled_for);

ALTER TABLE public.sales_followup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage followup queue" ON public.sales_followup_queue
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sales_followup_queue_updated
  BEFORE UPDATE ON public.sales_followup_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
