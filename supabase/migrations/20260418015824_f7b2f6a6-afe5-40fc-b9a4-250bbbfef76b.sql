-- Per-page image storage for multi-page sale flyers
CREATE TABLE public.sale_flyer_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_flyer_id UUID NOT NULL REFERENCES public.sale_flyers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sale_flyer_id, page_number)
);

CREATE INDEX idx_sale_flyer_pages_flyer ON public.sale_flyer_pages(sale_flyer_id, page_number);

ALTER TABLE public.sale_flyer_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees manage sale flyer pages"
ON public.sale_flyer_pages
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- Backfill existing flyers (treat the cover image_url as page 1) so re-extract works for legacy data
INSERT INTO public.sale_flyer_pages (sale_flyer_id, page_number, image_url)
SELECT id, 1, image_url
FROM public.sale_flyers
WHERE image_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sale_flyer_pages p WHERE p.sale_flyer_id = sale_flyers.id);