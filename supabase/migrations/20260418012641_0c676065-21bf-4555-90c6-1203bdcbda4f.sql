-- Sale flyers table
CREATE TABLE public.sale_flyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title text,
  image_url text,
  sale_start_date date,
  sale_end_date date,
  raw_ocr_text text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  uploaded_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_flyers_supplier ON public.sale_flyers(supplier_id);
CREATE INDEX idx_sale_flyers_dates ON public.sale_flyers(sale_start_date, sale_end_date);

-- Sale flyer items table (extracted line items)
CREATE TABLE public.sale_flyer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_flyer_id uuid NOT NULL REFERENCES public.sale_flyers(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text,
  unit text,
  pack_size text,
  sale_price numeric,
  regular_price numeric,
  savings numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_flyer_items_flyer ON public.sale_flyer_items(sale_flyer_id);
CREATE INDEX idx_sale_flyer_items_inventory ON public.sale_flyer_items(inventory_item_id);

-- updated_at trigger for flyers
CREATE TRIGGER update_sale_flyers_updated_at
BEFORE UPDATE ON public.sale_flyers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.sale_flyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_flyer_items ENABLE ROW LEVEL SECURITY;

-- Admins + employees full access on sale_flyers
CREATE POLICY "Admins and employees manage sale flyers"
ON public.sale_flyers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

-- Admins + employees full access on sale_flyer_items
CREATE POLICY "Admins and employees manage sale flyer items"
ON public.sale_flyer_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

-- Storage bucket for sale flyer images
INSERT INTO storage.buckets (id, name, public)
VALUES ('sale-flyers', 'sale-flyers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can view sale flyer images"
ON storage.objects FOR SELECT
USING (bucket_id = 'sale-flyers');

CREATE POLICY "Admins and employees upload sale flyers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sale-flyers'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
);

CREATE POLICY "Admins and employees update sale flyers"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'sale-flyers'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
);

CREATE POLICY "Admins and employees delete sale flyers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'sale-flyers'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
);