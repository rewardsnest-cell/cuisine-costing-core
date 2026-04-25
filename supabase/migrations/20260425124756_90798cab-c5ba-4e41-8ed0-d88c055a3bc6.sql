-- 1. Drop saved manual Kroger location override
DELETE FROM public.app_kv WHERE key = 'kroger_location_id';

-- 2. Smoothed Kroger signal columns on ingredient_reference
ALTER TABLE public.ingredient_reference
  ADD COLUMN IF NOT EXISTS kroger_signal_median numeric,
  ADD COLUMN IF NOT EXISTS kroger_signal_volatility numeric,
  ADD COLUMN IF NOT EXISTS kroger_signal_updated_at timestamptz;

-- 3. Replace propose_internal_cost_update with damping + FRED bound logic.
--    - When source='kroger' and no receipt has been observed in the last 60 days,
--      damp the proposed Kroger input so the resulting estimate change is <= 2%.
--      Larger movements still go to the cost_update_queue for review.
--    - Clamp the new estimate to [national * 0.5, national * 2.0] when a national
--      price exists in national_price_snapshots; outside that band -> queue.
CREATE OR REPLACE FUNCTION public.propose_internal_cost_update(
  _reference_id uuid,
  _source text,
  _new_kroger numeric DEFAULT NULL::numeric,
  _new_manual numeric DEFAULT NULL::numeric,
  _new_historical numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  eff_k numeric; eff_m numeric; eff_h numeric;
  current_est numeric;
  computed jsonb;
  proposed_est numeric;
  pct numeric := NULL;
  queue_id uuid;
  has_recent_receipt boolean := false;
  damped boolean := false;
  national numeric := NULL;
  out_of_band boolean := false;
  effective_k numeric;
BEGIN
  SELECT * INTO rec FROM public.ingredient_reference WHERE id = _reference_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ingredient_reference % not found', _reference_id; END IF;

  -- Manual cost is sacred: kroger source must NEVER overwrite it
  effective_k := COALESCE(_new_kroger, rec.kroger_unit_cost);
  eff_m := CASE WHEN _source = 'kroger' THEN rec.manual_unit_cost
                ELSE COALESCE(_new_manual, rec.manual_unit_cost) END;
  eff_h := COALESCE(_new_historical, rec.historical_avg_unit_cost);

  current_est := rec.internal_estimated_unit_cost;

  -- Single-source damping: if Kroger is moving the price and we have not seen a
  -- receipt for this inventory item in the last 60 days, damp the Kroger input
  -- so it can move the weighted estimate by at most ~2%.
  IF _source = 'kroger'
     AND _new_kroger IS NOT NULL
     AND current_est IS NOT NULL AND current_est > 0
     AND rec.inventory_item_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.price_history
      WHERE inventory_item_id = rec.inventory_item_id
        AND source = 'receipt'
        AND observed_at >= now() - interval '60 days'
    ) INTO has_recent_receipt;

    IF NOT has_recent_receipt THEN
      -- Compute unconstrained estimate first to find the natural delta.
      computed := public.compute_internal_estimated_cost(_new_kroger, eff_m, eff_h);
      proposed_est := NULLIF((computed->>'estimate'),'')::numeric;
      IF proposed_est IS NOT NULL THEN
        pct := (proposed_est - current_est) / current_est;
        IF abs(pct) > 0.02 THEN
          -- Solve for the Kroger value that produces exactly a +/- 2% move.
          -- weighted_est = wK*K + wM*M + wH*H, so K = (target - wM*M - wH*H)/wK
          DECLARE
            w jsonb := computed->'weights';
            wK numeric := COALESCE((w->>'kroger')::numeric, 0);
            wM numeric := COALESCE((w->>'manual')::numeric, 0);
            wH numeric := COALESCE((w->>'historical')::numeric, 0);
            target numeric := current_est * (1 + (CASE WHEN pct > 0 THEN 0.02 ELSE -0.02 END));
            damped_k numeric;
          BEGIN
            IF wK > 0 THEN
              damped_k := (target - wM * COALESCE(eff_m,0) - wH * COALESCE(eff_h,0)) / wK;
              IF damped_k > 0 THEN
                effective_k := damped_k;
                damped := true;
              END IF;
            END IF;
          END;
        END IF;
      END IF;
    END IF;
  END IF;

  computed := public.compute_internal_estimated_cost(effective_k, eff_m, eff_h);
  proposed_est := NULLIF((computed->>'estimate'), '')::numeric;

  -- FRED / national bound: clamp into [0.5x, 2x] of national price when known.
  IF proposed_est IS NOT NULL THEN
    SELECT price INTO national
    FROM public.national_price_snapshots
    WHERE ingredient_id = _reference_id
    ORDER BY snapshot_date DESC NULLS LAST
    LIMIT 1;
    IF national IS NOT NULL AND national > 0 THEN
      IF proposed_est < national * 0.5 OR proposed_est > national * 2.0 THEN
        out_of_band := true;
      END IF;
    END IF;
  END IF;

  IF current_est IS NOT NULL AND current_est > 0 AND proposed_est IS NOT NULL THEN
    pct := round(((proposed_est - current_est) / current_est * 100)::numeric, 2);
  END IF;

  -- Failsafe: >±5%, or out-of-FRED-band → approval queue
  IF (current_est IS NOT NULL AND current_est > 0 AND proposed_est IS NOT NULL AND abs(pct) > 5)
     OR out_of_band THEN
    INSERT INTO public.cost_update_queue (
      reference_id, source, current_cost, proposed_cost, percent_change,
      proposed_kroger_cost, proposed_manual_cost, proposed_historical_cost
    ) VALUES (
      _reference_id, _source, current_est, proposed_est, pct,
      effective_k, eff_m, eff_h
    ) RETURNING id INTO queue_id;

    -- Update raw source columns so the audit trail reflects what we observed
    -- (NOT the damped value — keep raw observation visible).
    IF _source = 'kroger' AND _new_kroger IS NOT NULL THEN
      UPDATE public.ingredient_reference
        SET kroger_unit_cost = _new_kroger, kroger_unit_cost_updated_at = now()
        WHERE id = _reference_id;
    ELSIF _source = 'historical' AND _new_historical IS NOT NULL THEN
      UPDATE public.ingredient_reference
        SET historical_avg_unit_cost = _new_historical, historical_avg_updated_at = now()
        WHERE id = _reference_id;
    END IF;

    INSERT INTO public.access_audit_log (action, actor_user_id, details)
    VALUES ('cost_update_flagged_for_review', auth.uid(), jsonb_build_object(
      'reference_id', _reference_id, 'item_name', rec.canonical_name,
      'source', _source, 'old_cost', current_est, 'proposed_cost', proposed_est,
      'percent_change', pct, 'queue_id', queue_id,
      'damped', damped, 'out_of_national_band', out_of_band, 'national_price', national
    ));
    RETURN jsonb_build_object('status','pending_approval','queue_id',queue_id,
      'old_cost',current_est,'proposed_cost',proposed_est,'percent_change',pct,
      'damped',damped,'out_of_national_band',out_of_band);
  END IF;

  -- Auto-apply path
  UPDATE public.ingredient_reference SET
    kroger_unit_cost = CASE WHEN _new_kroger IS NOT NULL THEN _new_kroger ELSE kroger_unit_cost END,
    kroger_unit_cost_updated_at = CASE WHEN _new_kroger IS NOT NULL THEN now() ELSE kroger_unit_cost_updated_at END,
    manual_unit_cost = CASE WHEN _source <> 'kroger' AND _new_manual IS NOT NULL THEN _new_manual ELSE manual_unit_cost END,
    manual_unit_cost_updated_at = CASE WHEN _source <> 'kroger' AND _new_manual IS NOT NULL THEN now() ELSE manual_unit_cost_updated_at END,
    manual_unit_cost_updated_by = CASE WHEN _source <> 'kroger' AND _new_manual IS NOT NULL THEN auth.uid() ELSE manual_unit_cost_updated_by END,
    historical_avg_unit_cost = CASE WHEN _new_historical IS NOT NULL THEN _new_historical ELSE historical_avg_unit_cost END,
    historical_avg_updated_at = CASE WHEN _new_historical IS NOT NULL THEN now() ELSE historical_avg_updated_at END,
    internal_estimated_unit_cost = proposed_est,
    internal_estimated_unit_cost_updated_at = now(),
    internal_cost_weights = computed->'weights',
    updated_at = now()
  WHERE id = _reference_id;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_auto_applied', auth.uid(), jsonb_build_object(
    'reference_id', _reference_id, 'item_name', rec.canonical_name,
    'source', _source, 'old_cost', current_est, 'new_cost', proposed_est,
    'percent_change', pct, 'damped', damped
  ));

  RETURN jsonb_build_object('status','applied','old_cost',current_est,
    'new_cost',proposed_est,'percent_change',pct,'damped',damped);
END;
$function$;

-- 4. Helper: compute smoothed Kroger market signal for one ingredient_reference
--    from the last 30 days of price_history.
CREATE OR REPLACE FUNCTION public.refresh_kroger_signal_from_history(_reference_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv uuid;
  med numeric;
  vol numeric;
BEGIN
  SELECT inventory_item_id INTO inv FROM public.ingredient_reference WHERE id = _reference_id;
  IF inv IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_inventory_link'); END IF;

  -- Regular-price median over last 30 days (level signal — promos excluded).
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price)::numeric
    INTO med
  FROM public.price_history
  WHERE inventory_item_id = inv
    AND source IN ('kroger','kroger_api')
    AND COALESCE(promo, false) = false
    AND observed_at >= now() - interval '30 days';

  -- Volatility = stddev of % discount on promo rows (just a signal, not a price).
  SELECT stddev_pop(unit_price)::numeric / NULLIF(med, 0)
    INTO vol
  FROM public.price_history
  WHERE inventory_item_id = inv
    AND source IN ('kroger','kroger_api')
    AND observed_at >= now() - interval '30 days';

  UPDATE public.ingredient_reference
     SET kroger_signal_median = med,
         kroger_signal_volatility = vol,
         kroger_signal_updated_at = now()
   WHERE id = _reference_id;

  RETURN jsonb_build_object('ok', true, 'median', med, 'volatility', vol);
END;
$function$;