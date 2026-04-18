CREATE TABLE public.competitor_quote_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_quote_id uuid NOT NULL REFERENCES public.competitor_quotes(id) ON DELETE CASCADE,
  page_number integer NOT NULL DEFAULT 1,
  image_url text NOT NULL,
  storage_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_quote_pages_quote ON public.competitor_quote_pages(competitor_quote_id, page_number);

ALTER TABLE public.competitor_quote_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage competitor quote pages"
ON public.competitor_quote_pages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));