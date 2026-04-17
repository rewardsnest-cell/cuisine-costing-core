CREATE TABLE public.inventory_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  user_id UUID,
  previous_stock NUMERIC NOT NULL DEFAULT 0,
  new_stock NUMERIC NOT NULL DEFAULT 0,
  change_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_adjustments_item ON public.inventory_adjustments(inventory_item_id, created_at DESC);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view adjustments"
ON public.inventory_adjustments FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert adjustments"
ON public.inventory_adjustments FOR INSERT
TO authenticated WITH CHECK (true);

-- Trigger function: log any stock change automatically
CREATE OR REPLACE FUNCTION public.log_inventory_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src TEXT;
  rsn TEXT;
BEGIN
  IF NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
    -- Allow callers to pass source/reason via session settings
    BEGIN
      src := COALESCE(current_setting('app.adjustment_source', true), 'manual');
    EXCEPTION WHEN OTHERS THEN src := 'manual';
    END;
    BEGIN
      rsn := current_setting('app.adjustment_reason', true);
    EXCEPTION WHEN OTHERS THEN rsn := NULL;
    END;

    INSERT INTO public.inventory_adjustments (
      inventory_item_id, user_id, previous_stock, new_stock, change_amount, reason, source
    ) VALUES (
      NEW.id, auth.uid(), OLD.current_stock, NEW.current_stock,
      NEW.current_stock - OLD.current_stock, NULLIF(rsn, ''), COALESCE(NULLIF(src, ''), 'manual')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_stock_change_log
AFTER UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.log_inventory_stock_change();