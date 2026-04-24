-- ============================================================
-- Stage 7 Extension: Internal Cost Intelligence + Approval Failsafe
-- ============================================================

-- A. Cost source columns on ingredient_reference
ALTER TABLE public.ingredient_reference
  ADD COLUMN IF NOT EXISTS kroger_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS kroger_unit_cost_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS manual_unit_cost_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_unit_cost_updated_by uuid,
  ADD COLUMN IF NOT EXISTS historical_avg_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS historical_avg_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_estimated_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS internal_estimated_unit_cost_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_cost_weights jsonb;

-- B. Compute weighted internal cost from available sources
CREATE OR REPLACE FUNCTION public.compute_internal_estimated_cost(
  _kroger numeric, _manual numeric, _historical numeric
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  w_k numeric := 0; w_m numeric := 0; w_h numeric := 0;
  total_w numeric := 0;
  est numeric := NULL;
BEGIN
  IF _kroger IS NOT NULL AND _kroger > 0 THEN w_k := 0.40; END IF;
  IF _manual IS NOT NULL AND _manual > 0 THEN w_m := 0.40; END IF;
  IF _historical IS NOT NULL AND _historical > 0 THEN w_h := 0.20; END IF;
  total_w := w_k + w_m + w_h;
  IF total_w = 0 THEN
    RETURN jsonb_build_object('estimate', NULL, 'weights', jsonb_build_object('kroger',0,'manual',0,'historical',0));
  END IF;
  -- Redistribute proportionally
  w_k := w_k / total_w;
  w_m := w_m / total_w;
  w_h := w_h / total_w;
  est := COALESCE(_kroger,0)*w_k + COALESCE(_manual,0)*w_m + COALESCE(_historical,0)*w_h;
  RETURN jsonb_build_object(
    'estimate', round(est::numeric, 4),
    'weights', jsonb_build_object('kroger', w_k, 'manual', w_m, 'historical', w_h)
  );
END;
$$;

-- C. Pending approval queue for >5% changes
CREATE TABLE IF NOT EXISTS public.cost_update_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES public.ingredient_reference(id) ON DELETE CASCADE,
  source text NOT NULL,
  current_cost numeric,
  proposed_cost numeric NOT NULL,
  percent_change numeric,
  proposed_kroger_cost numeric,
  proposed_manual_cost numeric,
  proposed_historical_cost numeric,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  final_applied_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_update_queue_status ON public.cost_update_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_update_queue_reference ON public.cost_update_queue(reference_id);

ALTER TABLE public.cost_update_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read cost_update_queue" ON public.cost_update_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert cost_update_queue" ON public.cost_update_queue
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update cost_update_queue" ON public.cost_update_queue
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete cost_update_queue" ON public.cost_update_queue
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cost_update_queue_touch
  BEFORE UPDATE ON public.cost_update_queue
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();

-- D. Apply or queue a proposed cost update with 5% failsafe
CREATE OR REPLACE FUNCTION public.propose_internal_cost_update(
  _reference_id uuid,
  _source text,
  _new_kroger numeric DEFAULT NULL,
  _new_manual numeric DEFAULT NULL,
  _new_historical numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  eff_k numeric; eff_m numeric; eff_h numeric;
  current_est numeric;
  computed jsonb;
  proposed_est numeric;
  pct numeric := NULL;
  queue_id uuid;
  action text;
  details jsonb;
BEGIN
  SELECT * INTO rec FROM public.ingredient_reference WHERE id = _reference_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ingredient_reference % not found', _reference_id; END IF;

  -- Manual cost is sacred: kroger source must NEVER overwrite it
  eff_k := COALESCE(_new_kroger, rec.kroger_unit_cost);
  eff_m := CASE WHEN _source = 'kroger' THEN rec.manual_unit_cost
                ELSE COALESCE(_new_manual, rec.manual_unit_cost) END;
  eff_h := COALESCE(_new_historical, rec.historical_avg_unit_cost);

  current_est := rec.internal_estimated_unit_cost;
  computed := public.compute_internal_estimated_cost(eff_k, eff_m, eff_h);
  proposed_est := NULLIF((computed->>'estimate'), '')::numeric;

  IF current_est IS NOT NULL AND current_est > 0 AND proposed_est IS NOT NULL THEN
    pct := round(((proposed_est - current_est) / current_est * 100)::numeric, 2);
  END IF;

  -- Failsafe: >±5% requires approval
  IF current_est IS NOT NULL AND current_est > 0 AND proposed_est IS NOT NULL
     AND abs(pct) > 5 THEN
    INSERT INTO public.cost_update_queue (
      reference_id, source, current_cost, proposed_cost, percent_change,
      proposed_kroger_cost, proposed_manual_cost, proposed_historical_cost
    ) VALUES (
      _reference_id, _source, current_est, proposed_est, pct,
      eff_k, eff_m, eff_h
    ) RETURNING id INTO queue_id;

    -- Update raw source columns (kroger/historical only — never manual via kroger)
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
      'percent_change', pct, 'queue_id', queue_id
    ));
    RETURN jsonb_build_object('status','pending_approval','queue_id',queue_id,
      'old_cost',current_est,'proposed_cost',proposed_est,'percent_change',pct);
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
    'percent_change', pct
  ));

  RETURN jsonb_build_object('status','applied','old_cost',current_est,
    'new_cost',proposed_est,'percent_change',pct);
END;
$$;

-- E. Approve / reject / override actions
CREATE OR REPLACE FUNCTION public.approve_cost_update(_queue_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE q record; ref record; computed jsonb; new_est numeric;
BEGIN
  SELECT * INTO q FROM public.cost_update_queue WHERE id = _queue_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item not found or already reviewed'; END IF;
  SELECT * INTO ref FROM public.ingredient_reference WHERE id = q.reference_id;

  computed := public.compute_internal_estimated_cost(q.proposed_kroger_cost, q.proposed_manual_cost, q.proposed_historical_cost);
  new_est := NULLIF((computed->>'estimate'),'')::numeric;

  UPDATE public.ingredient_reference SET
    kroger_unit_cost = q.proposed_kroger_cost,
    historical_avg_unit_cost = q.proposed_historical_cost,
    internal_estimated_unit_cost = new_est,
    internal_estimated_unit_cost_updated_at = now(),
    internal_cost_weights = computed->'weights',
    updated_at = now()
  WHERE id = q.reference_id;

  UPDATE public.cost_update_queue SET
    status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = _notes, final_applied_cost = new_est
  WHERE id = _queue_id;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_approved', auth.uid(), jsonb_build_object(
    'queue_id', _queue_id, 'reference_id', q.reference_id, 'item_name', ref.canonical_name,
    'old_cost', q.current_cost, 'proposed_cost', q.proposed_cost,
    'final_applied_cost', new_est, 'percent_change', q.percent_change
  ));
  RETURN jsonb_build_object('ok', true, 'applied_cost', new_est);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_cost_update(_queue_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE q record; ref record;
BEGIN
  SELECT * INTO q FROM public.cost_update_queue WHERE id = _queue_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item not found or already reviewed'; END IF;
  SELECT * INTO ref FROM public.ingredient_reference WHERE id = q.reference_id;

  UPDATE public.cost_update_queue SET
    status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes
  WHERE id = _queue_id;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_rejected', auth.uid(), jsonb_build_object(
    'queue_id', _queue_id, 'reference_id', q.reference_id, 'item_name', ref.canonical_name,
    'old_cost', q.current_cost, 'proposed_cost', q.proposed_cost, 'percent_change', q.percent_change
  ));
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.override_cost_update(_queue_id uuid, _manual_cost numeric, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE q record; ref record; computed jsonb; new_est numeric;
BEGIN
  SELECT * INTO q FROM public.cost_update_queue WHERE id = _queue_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item not found or already reviewed'; END IF;
  SELECT * INTO ref FROM public.ingredient_reference WHERE id = q.reference_id;

  computed := public.compute_internal_estimated_cost(ref.kroger_unit_cost, _manual_cost, ref.historical_avg_unit_cost);
  new_est := NULLIF((computed->>'estimate'),'')::numeric;

  UPDATE public.ingredient_reference SET
    manual_unit_cost = _manual_cost,
    manual_unit_cost_updated_at = now(),
    manual_unit_cost_updated_by = auth.uid(),
    internal_estimated_unit_cost = new_est,
    internal_estimated_unit_cost_updated_at = now(),
    internal_cost_weights = computed->'weights',
    updated_at = now()
  WHERE id = q.reference_id;

  UPDATE public.cost_update_queue SET
    status = 'overridden', reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = _notes, final_applied_cost = new_est
  WHERE id = _queue_id;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_overridden', auth.uid(), jsonb_build_object(
    'queue_id', _queue_id, 'reference_id', q.reference_id, 'item_name', ref.canonical_name,
    'old_cost', q.current_cost, 'proposed_cost', q.proposed_cost,
    'manual_override_cost', _manual_cost, 'final_applied_cost', new_est
  ));
  RETURN jsonb_build_object('ok', true, 'applied_cost', new_est);
END;
$$;