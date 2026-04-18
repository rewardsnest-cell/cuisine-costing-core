-- Create competitor_quotes table to persist analyzer results
CREATE TABLE public.competitor_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  -- Optional linkage to an account (guest if null)
  client_user_id UUID,
  client_name TEXT,
  client_email TEXT,
  -- Competitor info
  competitor_name TEXT,
  event_type TEXT,
  event_date DATE,
  guest_count INTEGER,
  per_guest_price NUMERIC,
  subtotal NUMERIC,
  taxes NUMERIC,
  gratuity NUMERIC,
  total NUMERIC,
  service_style TEXT,
  -- Structured analysis JSON (line items, addons, suggested counter, etc)
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  source_image_url TEXT,
  -- Counter-quote linkage if/when an admin generates one
  counter_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL
);

ALTER TABLE public.competitor_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage competitor quotes"
ON public.competitor_quotes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_competitor_quotes_updated_at
BEFORE UPDATE ON public.competitor_quotes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_competitor_quotes_client_user_id ON public.competitor_quotes(client_user_id);
CREATE INDEX idx_competitor_quotes_counter_quote_id ON public.competitor_quotes(counter_quote_id);
CREATE INDEX idx_competitor_quotes_created_at ON public.competitor_quotes(created_at DESC);