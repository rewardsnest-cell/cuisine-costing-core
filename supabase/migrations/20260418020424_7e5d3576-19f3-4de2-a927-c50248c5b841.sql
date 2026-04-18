-- Unified price history across all sources
CREATE TABLE public.price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('receipt', 'sale_flyer', 'purchase_order')),
  source_id UUID,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  unit_price NUMERIC NOT NULL,
  unit TEXT,
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_item_date ON public.price_history(inventory_item_id, observed_at DESC);
CREATE INDEX idx_price_history_source ON public.price_history(source, source_id);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view price history"
ON public.price_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert price history"
ON public.price_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins manage price history"
ON public.price_history FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger: log price point whenever a PO is applied to inventory
CREATE OR REPLACE FUNCTION public.apply_po_to_inventory(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
  cur_stock numeric;
  cur_avg numeric;
  new_stock numeric;
  new_avg numeric;
  po_supplier uuid;
BEGIN
  SELECT supplier_id INTO po_supplier FROM public.purchase_orders WHERE id = _po_id;

  FOR item IN
    SELECT inventory_item_id, quantity, unit_price, unit
    FROM public.purchase_order_items
    WHERE purchase_order_id = _po_id AND inventory_item_id IS NOT NULL
  LOOP
    SELECT current_stock, average_cost_per_unit INTO cur_stock, cur_avg
    FROM public.inventory_items WHERE id = item.inventory_item_id;

    cur_stock := COALESCE(cur_stock, 0);
    cur_avg := COALESCE(cur_avg, 0);
    new_stock := cur_stock + item.quantity;

    IF new_stock > 0 THEN
      new_avg := ((cur_stock * cur_avg) + (item.quantity * item.unit_price)) / new_stock;
    ELSE
      new_avg := item.unit_price;
    END IF;

    UPDATE public.inventory_items
    SET current_stock = new_stock,
        last_receipt_cost = item.unit_price,
        average_cost_per_unit = new_avg,
        updated_at = now()
    WHERE id = item.inventory_item_id;

    INSERT INTO public.inventory_adjustments (
      inventory_item_id, user_id, previous_stock, new_stock, change_amount, reason, source
    ) VALUES (
      item.inventory_item_id, auth.uid(), cur_stock, new_stock,
      item.quantity, 'PO received: ' || _po_id::text, 'purchase_order'
    );

    INSERT INTO public.price_history (
      inventory_item_id, source, source_id, supplier_id, unit_price, unit
    ) VALUES (
      item.inventory_item_id, 'purchase_order', _po_id, po_supplier, item.unit_price, item.unit
    );
  END LOOP;
END;
$function$;

-- Backfill from existing PO items (best-effort historical seed)
INSERT INTO public.price_history (inventory_item_id, source, source_id, supplier_id, unit_price, unit, observed_at)
SELECT poi.inventory_item_id, 'purchase_order', po.id, po.supplier_id, poi.unit_price, poi.unit, po.created_at
FROM public.purchase_order_items poi
JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
WHERE poi.inventory_item_id IS NOT NULL AND poi.unit_price > 0;

-- Backfill from sale flyer items with linked inventory + active flyer dates
INSERT INTO public.price_history (inventory_item_id, source, source_id, supplier_id, unit_price, unit, observed_at)
SELECT sfi.inventory_item_id, 'sale_flyer', sf.id, sf.supplier_id, sfi.sale_price, sfi.unit,
       COALESCE(sf.sale_start_date::timestamptz, sf.created_at)
FROM public.sale_flyer_items sfi
JOIN public.sale_flyers sf ON sf.id = sfi.sale_flyer_id
WHERE sfi.inventory_item_id IS NOT NULL AND sfi.sale_price IS NOT NULL AND sfi.sale_price > 0;