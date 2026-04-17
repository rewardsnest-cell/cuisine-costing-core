DROP TRIGGER IF EXISTS inventory_stock_change_log ON public.inventory_items;
DROP FUNCTION IF EXISTS public.log_inventory_stock_change();

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
BEGIN
  FOR item IN
    SELECT inventory_item_id, quantity, unit_price
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
  END LOOP;
END;
$function$;