-- Recompute a single quote's subtotal/total based on its items and tax_rate
CREATE OR REPLACE FUNCTION public.recompute_quote_totals(_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _subtotal numeric := 0;
  _tax_rate numeric := 0;
  _total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO _subtotal
  FROM public.quote_items WHERE quote_id = _quote_id;

  SELECT COALESCE(tax_rate, 0) INTO _tax_rate
  FROM public.quotes WHERE id = _quote_id;

  _subtotal := round(_subtotal::numeric, 2);
  _total := round((_subtotal * (1 + COALESCE(_tax_rate, 0)))::numeric, 2);

  UPDATE public.quotes
     SET subtotal = _subtotal,
         total = _total,
         updated_at = now()
   WHERE id = _quote_id;
END;
$$;

-- Trigger function: when recipes.cost_per_serving changes, refresh linked quote_items
CREATE OR REPLACE FUNCTION public.trg_recipe_cps_refresh_quote_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _markup numeric;
  _lock_days integer;
  _affected_quotes uuid[];
  qid uuid;
BEGIN
  IF NEW.cost_per_serving IS NOT DISTINCT FROM OLD.cost_per_serving THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(markup_multiplier, 3.0), COALESCE(revision_lock_days, 7)
    INTO _markup, _lock_days
  FROM public.app_settings WHERE id = 1;
  _markup := COALESCE(_markup, 3.0);
  _lock_days := COALESCE(_lock_days, 7);

  -- Update items, but skip items belonging to quotes within the revision lock window
  WITH updated AS (
    UPDATE public.quote_items qi
       SET unit_price = round((COALESCE(NEW.cost_per_serving, 0) * _markup)::numeric, 2),
           total_price = round((COALESCE(NEW.cost_per_serving, 0) * _markup * COALESCE(qi.quantity, 1))::numeric, 2)
      FROM public.quotes q
     WHERE qi.recipe_id = NEW.id
       AND q.id = qi.quote_id
       AND (q.event_date IS NULL OR CURRENT_DATE <= (q.event_date - _lock_days))
    RETURNING qi.quote_id
  )
  SELECT array_agg(DISTINCT quote_id) INTO _affected_quotes FROM updated;

  IF _affected_quotes IS NOT NULL THEN
    FOREACH qid IN ARRAY _affected_quotes LOOP
      PERFORM public.recompute_quote_totals(qid);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_cps_refresh_quote_items ON public.recipes;
CREATE TRIGGER recipes_cps_refresh_quote_items
AFTER UPDATE OF cost_per_serving ON public.recipes
FOR EACH ROW
EXECUTE FUNCTION public.trg_recipe_cps_refresh_quote_items();