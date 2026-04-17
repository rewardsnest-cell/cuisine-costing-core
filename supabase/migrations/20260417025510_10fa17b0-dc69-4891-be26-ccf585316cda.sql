-- Function to apply a received PO to inventory
CREATE OR REPLACE FUNCTION public.apply_po_to_inventory(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  END LOOP;
END;
$$;

-- Trigger on purchase_orders status change to 'received'
CREATE OR REPLACE FUNCTION public.trg_po_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS DISTINCT FROM 'received') THEN
    PERFORM public.apply_po_to_inventory(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_orders_received_trigger ON public.purchase_orders;
CREATE TRIGGER purchase_orders_received_trigger
AFTER UPDATE OF status ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_po_received();