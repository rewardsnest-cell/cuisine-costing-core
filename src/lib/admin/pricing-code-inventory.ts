// Read-only catalogue of pricing-related code in the repository.
// Surfaced via /admin/pricing-code-inventory so admins can review what exists
// before refactoring or extending the pricing/cost system.

export const PRICING_INVENTORY_GENERATED_AT = "2026-04-25";

export type InventoryRecommendation =
  | "KEEP"
  | "CENTRALIZE"
  | "EXPOSE"
  | "LEGACY";

export type InventoryEntry = {
  path: string;
  layer: string;
  purpose: string;
  notes: string;
  recommendation: InventoryRecommendation;
};

export const PRICING_INVENTORY: InventoryEntry[] = [
  {
    path: "src/lib/recipe-costing.ts",
    layer: "Cost normalization & units",
    purpose: "Unit math, weight conversions (WEIGHT_TO_LB), recipe cost rollup.",
    notes: "Lacks density bridging (weight ↔ volume). Good candidate to centralize.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "src/lib/server/kroger-core.ts",
    layer: "Cost ingestion (Kroger)",
    purpose: "OAuth, ZIP/Location resolution, normalizeKrogerPrice().",
    notes: "Single source of truth for Kroger price normalization.",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/kroger-ingest-internal.functions.ts",
    layer: "Cost ingestion (Kroger)",
    purpose: "Signal-only Kroger ingest; routes through cost_update_queue.",
    notes: "Does not mutate inventory directly. Audit-friendly.",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/kroger-pricing.functions.ts",
    layer: "Cost ingestion (Kroger)",
    purpose: "Kroger pricing lookups for admin tools.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/update-inventory-costs.functions.ts",
    layer: "Cost ingestion (Receipts)",
    purpose: "Updates inventory_items.average_cost_per_unit from receipts.",
    notes: "Averaging logic differs slightly from apply_po_to_inventory SQL.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "supabase: apply_po_to_inventory()",
    layer: "Cost ingestion (Purchase Orders)",
    purpose: "Mutates average_cost_per_unit when POs are applied.",
    notes: "Should converge with receipts averaging into one helper.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "src/lib/server-fns/fred-pricing.functions.ts",
    layer: "National baselines",
    purpose: "Pulls FRED national price feeds; recomputes recipe costs on update.",
    notes: "Trusted national reference data for floor/margin checks.",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/recalc-quote-pricing.functions.ts",
    layer: "Quote application",
    purpose: "Applies global markup_multiplier from app_settings to quotes.",
    notes: "Discrepancy: SQL honors per-recipe markup_percentage. Reconcile.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "src/lib/server-fns/apply-national-floor.functions.ts",
    layer: "Quote application",
    purpose: "Margin-safe re-pricing using national snapshot vs local average.",
    notes: "Good guardrail logic — expose to Item Cost Matrix.",
    recommendation: "EXPOSE",
  },
  {
    path: "src/lib/server-fns/cost-intelligence.functions.ts",
    layer: "Guardrails & audit",
    purpose: "Primary API for cost_update_queue (propose/approve/reject/override).",
    notes: "Mutation hub. All significant cost shifts flow through here.",
    recommendation: "KEEP",
  },
  {
    path: "supabase: trg_recipe_sync_pricing_columns",
    layer: "Guardrails & audit",
    purpose: "Trigger keeps recipe price columns in sync after cost changes.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/routes/admin/pricing-lab.preview.tsx",
    layer: "Admin UI",
    purpose: "Older preview of Pricing Lab.",
    notes: "Appears redundant vs pricing-lab.tsx.",
    recommendation: "LEGACY",
  },
  {
    path: "src/routes/admin/pricing.national.tsx",
    layer: "Admin UI",
    purpose: "Older national-pricing view.",
    notes: "Superseded by national-prices.tsx.",
    recommendation: "LEGACY",
  },
  {
    path: "src/routes/admin/national-prices.tsx",
    layer: "Admin UI",
    purpose: "Current national prices admin view.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/routes/admin/kroger-pricing.tsx",
    layer: "Admin UI",
    purpose: "Kroger pricing dashboard.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/routes/admin/cost-queue.tsx",
    layer: "Admin UI",
    purpose: "Cost Update Queue UI consuming cost-intelligence.functions.ts.",
    notes: "",
    recommendation: "KEEP",
  },
];

export const SQL_PRICING_REFERENCES: { name: string; purpose: string }[] = [
  { name: "apply_po_to_inventory", purpose: "Applies PO lines to average_cost_per_unit." },
  { name: "trg_recipe_sync_pricing_columns", purpose: "Keeps recipe pricing columns aligned with cost changes." },
  { name: "cost_update_queue (table)", purpose: "Audit-friendly queue for proposed cost mutations." },
  { name: "access_audit_log (table)", purpose: "Records significant cost shifts (>5%) and overrides." },
];

export type SqlAppendixKind = "function" | "trigger_function" | "view" | "trigger" | "table_note";

export type SqlAppendixEntry = {
  name: string;
  kind: SqlAppendixKind;
  purpose: string;
  definition: string;
};

// Verbatim definitions copied from the live database. Read-only — do not edit
// unless you also update the corresponding migration. This appendix is what
// the Pricing Code Inventory page exports as `pricing-sql-appendix.sql`.
export const SQL_PRICING_APPENDIX: SqlAppendixEntry[] = [
  {
    name: "compute_internal_estimated_cost",
    kind: "function",
    purpose: "Weighted blend of Kroger / manual / historical unit costs (40/40/20, redistributed when sources are missing).",
    definition: `CREATE OR REPLACE FUNCTION public.compute_internal_estimated_cost(_kroger numeric, _manual numeric, _historical numeric)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE w_k numeric := 0; w_m numeric := 0; w_h numeric := 0; total_w numeric := 0; est numeric := NULL;
BEGIN
  IF _kroger IS NOT NULL AND _kroger > 0 THEN w_k := 0.40; END IF;
  IF _manual IS NOT NULL AND _manual > 0 THEN w_m := 0.40; END IF;
  IF _historical IS NOT NULL AND _historical > 0 THEN w_h := 0.20; END IF;
  total_w := w_k + w_m + w_h;
  IF total_w = 0 THEN
    RETURN jsonb_build_object('estimate', NULL, 'weights', jsonb_build_object('kroger',0,'manual',0,'historical',0));
  END IF;
  w_k := w_k / total_w; w_m := w_m / total_w; w_h := w_h / total_w;
  est := COALESCE(_kroger,0)*w_k + COALESCE(_manual,0)*w_m + COALESCE(_historical,0)*w_h;
  RETURN jsonb_build_object('estimate', round(est::numeric, 4),
    'weights', jsonb_build_object('kroger', w_k, 'manual', w_m, 'historical', w_h));
END;
$function$;`,
  },
  {
    name: "propose_internal_cost_update",
    kind: "function",
    purpose: "Single entry point for cost mutations. Auto-applies <=5% changes; routes >5% to cost_update_queue. Manual cost is sacred — Kroger source can never overwrite it.",
    definition: `-- See live DB for full body. Behaviour:
-- 1) Reads current ingredient_reference row.
-- 2) Computes new blended estimate via compute_internal_estimated_cost.
-- 3) If |percent_change| > 5: inserts into cost_update_queue (status='pending')
--    and writes 'cost_update_flagged_for_review' to access_audit_log.
-- 4) Otherwise applies in-place and writes 'cost_update_auto_applied'.
-- 5) Kroger source NEVER overwrites manual_unit_cost.`,
  },
  {
    name: "approve_cost_update",
    kind: "function",
    purpose: "Approves a queued cost change and applies the recomputed estimate to ingredient_reference.",
    definition: `CREATE OR REPLACE FUNCTION public.approve_cost_update(_queue_id uuid, _notes text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  UPDATE public.cost_update_queue SET status='approved', reviewed_by=auth.uid(),
    reviewed_at=now(), review_notes=_notes, final_applied_cost=new_est
  WHERE id = _queue_id;
  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_approved', auth.uid(), jsonb_build_object(
    'queue_id', _queue_id, 'reference_id', q.reference_id, 'item_name', ref.canonical_name,
    'old_cost', q.current_cost, 'proposed_cost', q.proposed_cost,
    'final_applied_cost', new_est, 'percent_change', q.percent_change));
  RETURN jsonb_build_object('ok', true, 'applied_cost', new_est);
END;
$function$;`,
  },
  {
    name: "reject_cost_update",
    kind: "function",
    purpose: "Rejects a queued cost change and writes an audit entry.",
    definition: `CREATE OR REPLACE FUNCTION public.reject_cost_update(_queue_id uuid, _notes text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q record; ref record;
BEGIN
  SELECT * INTO q FROM public.cost_update_queue WHERE id = _queue_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item not found or already reviewed'; END IF;
  SELECT * INTO ref FROM public.ingredient_reference WHERE id = q.reference_id;
  UPDATE public.cost_update_queue SET status='rejected', reviewed_by=auth.uid(),
    reviewed_at=now(), review_notes=_notes WHERE id = _queue_id;
  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_rejected', auth.uid(), jsonb_build_object(
    'queue_id', _queue_id, 'reference_id', q.reference_id, 'item_name', ref.canonical_name,
    'old_cost', q.current_cost, 'proposed_cost', q.proposed_cost, 'percent_change', q.percent_change));
  RETURN jsonb_build_object('ok', true);
END;
$function$;`,
  },
  {
    name: "override_cost_update",
    kind: "function",
    purpose: "Admin-only manual override path. Sets manual_unit_cost and recomputes the blended estimate.",
    definition: `CREATE OR REPLACE FUNCTION public.override_cost_update(_queue_id uuid, _manual_cost numeric, _notes text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q record; ref record; computed jsonb; new_est numeric;
BEGIN
  SELECT * INTO q FROM public.cost_update_queue WHERE id = _queue_id AND status='pending';
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
  UPDATE public.cost_update_queue SET status='overridden', reviewed_by=auth.uid(),
    reviewed_at=now(), review_notes=_notes, final_applied_cost=new_est
  WHERE id = _queue_id;
  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES ('cost_update_overridden', auth.uid(), jsonb_build_object(
    'queue_id', _queue_id, 'reference_id', q.reference_id, 'item_name', ref.canonical_name,
    'old_cost', q.current_cost, 'proposed_cost', q.proposed_cost,
    'manual_override_cost', _manual_cost, 'final_applied_cost', new_est));
  RETURN jsonb_build_object('ok', true, 'applied_cost', new_est);
END;
$function$;`,
  },
  {
    name: "apply_po_to_inventory",
    kind: "function",
    purpose: "When a PO is marked received, blends each line into average_cost_per_unit and writes price_history rows.",
    definition: `CREATE OR REPLACE FUNCTION public.apply_po_to_inventory(_po_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE item RECORD; cur_stock numeric; cur_avg numeric;
        new_stock numeric; new_avg numeric; po_supplier uuid;
BEGIN
  SELECT supplier_id INTO po_supplier FROM public.purchase_orders WHERE id = _po_id;
  FOR item IN
    SELECT inventory_item_id, quantity, unit_price, unit
    FROM public.purchase_order_items
    WHERE purchase_order_id = _po_id AND inventory_item_id IS NOT NULL
  LOOP
    SELECT current_stock, average_cost_per_unit INTO cur_stock, cur_avg
    FROM public.inventory_items WHERE id = item.inventory_item_id;
    cur_stock := COALESCE(cur_stock, 0); cur_avg := COALESCE(cur_avg, 0);
    new_stock := cur_stock + item.quantity;
    IF new_stock > 0 THEN
      new_avg := ((cur_stock * cur_avg) + (item.quantity * item.unit_price)) / new_stock;
    ELSE
      new_avg := item.unit_price;
    END IF;
    UPDATE public.inventory_items
    SET current_stock = new_stock, last_receipt_cost = item.unit_price,
        average_cost_per_unit = new_avg, updated_at = now()
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
$function$;`,
  },
  {
    name: "trg_po_received",
    kind: "trigger_function",
    purpose: "Fires apply_po_to_inventory() when a purchase_orders row transitions to status='received'.",
    definition: `CREATE OR REPLACE FUNCTION public.trg_po_received()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS DISTINCT FROM 'received') THEN
    PERFORM public.apply_po_to_inventory(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;`,
  },
  {
    name: "trg_inventory_cost_changed",
    kind: "trigger_function",
    purpose: "When inventory_items.average_cost_per_unit changes, recomputes every recipe that references the item.",
    definition: `CREATE OR REPLACE FUNCTION public.trg_inventory_cost_changed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rid uuid;
BEGIN
  IF NEW.average_cost_per_unit IS DISTINCT FROM OLD.average_cost_per_unit THEN
    FOR rid IN SELECT DISTINCT recipe_id FROM recipe_ingredients WHERE inventory_item_id = NEW.id LOOP
      PERFORM public.recompute_recipe_cost(rid);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;`,
  },
  {
    name: "compute_recipe_selling_price",
    kind: "function",
    purpose: "Per-serving selling price = cost × (1 + markup%) when set, else app_settings.markup_multiplier (default 3.0).",
    definition: `CREATE OR REPLACE FUNCTION public.compute_recipe_selling_price(_cost_per_serving numeric, _markup_percentage numeric)
 RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT round(
    (COALESCE(_cost_per_serving, 0) *
      CASE
        WHEN _markup_percentage IS NOT NULL AND _markup_percentage > 0
          THEN (1 + _markup_percentage / 100.0)
        ELSE COALESCE((SELECT markup_multiplier FROM public.app_settings WHERE id = 1), 3.0)
      END
    )::numeric, 2)
$function$;`,
  },
  {
    name: "trg_recipe_sync_pricing_columns",
    kind: "trigger_function",
    purpose: "Keeps calculated_cost_per_person and selling_price_per_person aligned whenever a recipe row is written.",
    definition: `CREATE OR REPLACE FUNCTION public.trg_recipe_sync_pricing_columns()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  NEW.calculated_cost_per_person := COALESCE(NEW.cost_per_serving, 0);
  NEW.selling_price_per_person := public.compute_recipe_selling_price(NEW.cost_per_serving, NEW.markup_percentage);
  RETURN NEW;
END;
$function$;`,
  },
  {
    name: "recompute_quote_totals",
    kind: "function",
    purpose: "Recomputes quote subtotal/total from quote_items, applying the quote's tax_rate.",
    definition: `CREATE OR REPLACE FUNCTION public.recompute_quote_totals(_quote_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _subtotal numeric := 0; _tax_rate numeric := 0; _total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO _subtotal
  FROM public.quote_items WHERE quote_id = _quote_id;
  SELECT COALESCE(tax_rate, 0) INTO _tax_rate
  FROM public.quotes WHERE id = _quote_id;
  _subtotal := round(_subtotal::numeric, 2);
  _total := round((_subtotal * (1 + COALESCE(_tax_rate, 0)))::numeric, 2);
  UPDATE public.quotes SET subtotal=_subtotal, total=_total, updated_at=now() WHERE id = _quote_id;
END;
$function$;`,
  },
  {
    name: "kroger_price_signals",
    kind: "view",
    purpose: "Per-inventory-item rollup comparing local average to a 30-day Kroger median. Emits flag: ok / inventory_cheap / inventory_expensive / stale_inventory / no_signal.",
    definition: `CREATE OR REPLACE FUNCTION public.kroger_price_signals()
 RETURNS TABLE(inventory_item_id uuid, inventory_name text, inventory_unit text,
               inventory_avg numeric, inventory_last_update timestamptz,
               kroger_30d_median numeric, kroger_sample_count integer,
               kroger_last_observed timestamptz, flag text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH kroger AS (
    SELECT ph.inventory_item_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ph.unit_price)::numeric AS median_30d,
           COUNT(*)::int AS sample_count,
           MAX(ph.observed_at) AS last_observed
    FROM public.price_history ph
    WHERE ph.source = 'kroger_api'
      AND ph.observed_at >= now() - interval '30 days'
      AND ph.inventory_item_id IS NOT NULL
    GROUP BY ph.inventory_item_id
  )
  SELECT i.id, i.name, i.unit, i.average_cost_per_unit, i.updated_at,
         k.median_30d, COALESCE(k.sample_count, 0), k.last_observed,
         CASE
           WHEN k.median_30d IS NULL THEN 'no_signal'
           WHEN i.average_cost_per_unit > 0
            AND i.average_cost_per_unit < k.median_30d * 0.70 THEN 'inventory_cheap'
           WHEN i.average_cost_per_unit > 0
            AND i.average_cost_per_unit > k.median_30d * 1.40 THEN 'inventory_expensive'
           WHEN i.updated_at < now() - interval '90 days'
            AND k.sample_count >= 3 THEN 'stale_inventory'
           ELSE 'ok'
         END AS flag
  FROM public.inventory_items i
  LEFT JOIN kroger k ON k.inventory_item_id = i.id;
$function$;`,
  },
  {
    name: "recipe_pricing_health_summary",
    kind: "view",
    purpose: "Per-recipe pricing health (healthy / warning / blocked) with stale ingredient counts based on app_kv.pricing_freshness_days (default 90).",
    definition: `CREATE OR REPLACE FUNCTION public.recipe_pricing_health_summary()
 RETURNS TABLE(recipe_id uuid, health_status text, stale_ingredient_count integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE freshness_days int; stale_threshold timestamptz;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 90) INTO freshness_days
    FROM app_kv WHERE key = 'pricing_freshness_days';
  freshness_days := COALESCE(freshness_days, 90);
  stale_threshold := now() - (freshness_days || ' days')::interval;
  RETURN QUERY
  WITH stale_counts AS (
    SELECT ri.recipe_id,
           COUNT(*) FILTER (WHERE inv.updated_at < stale_threshold)::int AS stale_count
    FROM recipe_ingredients ri
    LEFT JOIN ingredient_reference ref ON ref.id = ri.reference_id
    LEFT JOIN inventory_items inv ON inv.id = ref.inventory_item_id
    GROUP BY ri.recipe_id
  )
  SELECT r.id,
    CASE
      WHEN COALESCE(r.pricing_status, 'valid') <> 'valid' THEN 'blocked'
      WHEN COALESCE(sc.stale_count, 0) > 0 THEN 'warning'
      ELSE 'healthy'
    END,
    COALESCE(sc.stale_count, 0)
  FROM recipes r
  LEFT JOIN stale_counts sc ON sc.recipe_id = r.id;
END;
$function$;`,
  },
  {
    name: "draft_change_log_for_cost_update_approval",
    kind: "trigger_function",
    purpose: "Drafts a change_log entry whenever an approved cost_update_queue row exceeds ±5%.",
    definition: `CREATE OR REPLACE FUNCTION public.draft_change_log_for_cost_update_approval()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_email text := (auth.jwt() ->> 'email');
        v_pct numeric; v_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
    v_pct := COALESCE(NEW.percent_change, 0);
    IF abs(v_pct) > 5 THEN
      SELECT canonical_name INTO v_name FROM public.ingredient_reference WHERE id = NEW.reference_id;
      INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
      VALUES (
        'Cost update approved (>5%): ' || COALESCE(v_name, NEW.reference_id::text),
        'A cost update of ' || round(v_pct, 2)::text || '% was approved for "' ||
          COALESCE(v_name, NEW.reference_id::text) || '" (source: ' || NEW.source || ').',
        'draft', true, v_actor, v_email);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;`,
  },
  {
    name: "draft_change_log_for_pricing_model_status",
    kind: "trigger_function",
    purpose: "Drafts a change_log entry whenever a pricing_model is activated or archived.",
    definition: `CREATE OR REPLACE FUNCTION public.draft_change_log_for_pricing_model_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text IN ('active', 'archived') THEN
      INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
      VALUES (
        'Pricing model ' || NEW.status::text || ': ' || NEW.name,
        'Pricing model "' || NEW.name || '" status moved from ' || OLD.status::text || ' to ' || NEW.status::text || '.',
        'draft', true, v_actor, v_email);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;`,
  },
  {
    name: "cost_update_queue / access_audit_log",
    kind: "table_note",
    purpose: "Backbone tables for the cost-mutation audit trail. Every propose/approve/reject/override writes both.",
    definition: `-- Tables (definitions live in earlier migrations):
--   public.cost_update_queue   — pending/approved/rejected/overridden proposals
--     key columns: reference_id, source, current_cost, proposed_cost,
--                  proposed_kroger_cost, proposed_manual_cost, proposed_historical_cost,
--                  percent_change, status, reviewed_by, reviewed_at, final_applied_cost
--   public.access_audit_log    — append-only audit stream
--     pricing actions: cost_update_flagged_for_review, cost_update_auto_applied,
--                      cost_update_approved, cost_update_rejected, cost_update_overridden`,
  },
];

export function buildSqlAppendixText(): string {
  const header = [
    "-- Pricing Code Inventory — SQL Appendix",
    `-- Generated: ${PRICING_INVENTORY_GENERATED_AT}`,
    "-- Read-only export. Definitions copied from the live database for reference.",
    "-- Do NOT execute this file directly; use migrations to change schema.",
    "",
  ].join("\n");
  const sections = SQL_PRICING_APPENDIX.map((e) => [
    `-- =====================================================================`,
    `-- ${e.kind.toUpperCase()}: ${e.name}`,
    `-- ${e.purpose}`,
    `-- =====================================================================`,
    e.definition,
    "",
  ].join("\n"));
  return header + "\n" + sections.join("\n");
}

export function summarizeInventory(entries: InventoryEntry[] = PRICING_INVENTORY) {
  const byRecommendation: Record<InventoryRecommendation, number> = {
    KEEP: 0,
    CENTRALIZE: 0,
    EXPOSE: 0,
    LEGACY: 0,
  };
  for (const e of entries) byRecommendation[e.recommendation]++;
  return { total: entries.length, byRecommendation };
}
