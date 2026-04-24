import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

// ---------- Schemas (end-to-end TypeScript validation) ----------

const ListSearchSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    limit: z.number().int().positive().max(500).optional(),
  })
  .strict()
  .optional();

const ListQueueSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "overridden"]).optional(),
  })
  .strict()
  .optional();

const ProposeSchema = z
  .object({
    reference_id: z.string().uuid(),
    source: z.enum(["kroger", "manual", "historical"]),
    kroger_cost: z.number().finite().nonnegative().nullable().optional(),
    manual_cost: z.number().finite().nonnegative().nullable().optional(),
    historical_cost: z.number().finite().nonnegative().nullable().optional(),
  })
  .strict();

const QueueIdSchema = z
  .object({
    queue_id: z.string().uuid(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const OverrideSchema = z
  .object({
    queue_id: z.string().uuid(),
    manual_cost: z.number().finite().positive(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const BulkSchema = z
  .object({
    queue_ids: z.array(z.string().uuid()).min(1).max(500),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const SimulateSchema = z
  .object({
    queue_ids: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict();

const BreakdownSchema = z.object({ reference_id: z.string().uuid() }).strict();

const TimelineSchema = z.object({ queue_id: z.string().uuid() }).strict();

const RecomputeSchema = z
  .object({
    reference_ids: z.array(z.string().uuid()).max(2000).optional(),
    abnormal_delta_pct: z.number().min(0).max(1).optional(),
  })
  .strict()
  .optional();

const LowConfSchema = z
  .object({
    confidence_threshold: z.number().min(0).max(1).optional(),
    limit: z.number().int().positive().max(500).optional(),
  })
  .strict()
  .optional();

const SetMatchSchema = z
  .object({
    receipt_id: z.string().uuid(),
    line_index: z.number().int().nonnegative(),
    inventory_item_id: z.string().uuid().nullable(),
  })
  .strict();

const SearchInvSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();

// ---------- Cost queue & item cost listings ----------

export const listIngredientCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSearchSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("ingredient_reference")
      .select(
        "id,canonical_name,default_unit,kroger_unit_cost,kroger_unit_cost_updated_at,manual_unit_cost,manual_unit_cost_updated_at,historical_avg_unit_cost,historical_avg_updated_at,internal_estimated_unit_cost,internal_estimated_unit_cost_updated_at,internal_cost_weights",
      )
      .order("canonical_name", { ascending: true })
      .limit(data.limit ?? 200);
    if (data.search && data.search.length > 0) {
      q = q.ilike("canonical_name", `%${data.search}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCostUpdateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListQueueSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("cost_update_queue")
      .select(
        "id,reference_id,source,current_cost,proposed_cost,percent_change,status,reviewed_by,reviewed_at,review_notes,final_applied_cost,created_at,ingredient_reference(canonical_name,default_unit)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    q = q.eq("status", data.status ?? "pending");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const proposeCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProposeSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("propose_internal_cost_update", {
      _reference_id: data.reference_id,
      _source: data.source,
      _new_kroger: data.kroger_cost ?? undefined,
      _new_manual: data.manual_cost ?? undefined,
      _new_historical: data.historical_cost ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const approveCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QueueIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("approve_cost_update", {
      _queue_id: data.queue_id,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("access_audit_log").insert({
      action: "cost_update_approved",
      actor_user_id: context.userId,
      details: { queue_id: data.queue_id, notes: data.notes ?? null },
    });
    return result as any;
  });

export const rejectCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QueueIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("reject_cost_update", {
      _queue_id: data.queue_id,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("access_audit_log").insert({
      action: "cost_update_rejected",
      actor_user_id: context.userId,
      details: { queue_id: data.queue_id, notes: data.notes ?? null },
    });
    return result as any;
  });

export const overrideCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OverrideSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("override_cost_update", {
      _queue_id: data.queue_id,
      _manual_cost: data.manual_cost,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("access_audit_log").insert({
      action: "cost_update_overridden",
      actor_user_id: context.userId,
      details: { queue_id: data.queue_id, manual_cost: data.manual_cost, notes: data.notes ?? null },
    });
    return result as any;
  });

// ---------- Bulk actions with per-item audit + success/failure counts ----------

type BulkResult = {
  queue_id: string;
  ok: boolean;
  error?: string;
  reference_id?: string | null;
  item_name?: string | null;
};

async function loadQueueRowMeta(queue_id: string) {
  const { data } = await supabaseAdmin
    .from("cost_update_queue")
    .select("id,reference_id,current_cost,proposed_cost,percent_change,source,ingredient_reference(canonical_name)")
    .eq("id", queue_id)
    .maybeSingle();
  if (!data) return { reference_id: null, item_name: null, meta: null as any };
  const ref: any = (data as any).ingredient_reference ?? {};
  return {
    reference_id: data.reference_id,
    item_name: ref.canonical_name ?? null,
    meta: data,
  };
}

export const bulkApproveCostUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const results: BulkResult[] = [];
    for (const qid of data.queue_ids) {
      const meta = await loadQueueRowMeta(qid);
      const { error } = await supabaseAdmin.rpc("approve_cost_update", {
        _queue_id: qid,
        _notes: data.notes ?? undefined,
      });
      const ok = !error;
      results.push({
        queue_id: qid,
        ok,
        error: error?.message,
        reference_id: meta.reference_id,
        item_name: meta.item_name,
      });
      // Per-item audit entry
      await supabaseAdmin.from("access_audit_log").insert({
        action: ok ? "cost_update_bulk_approved" : "cost_update_bulk_approve_failed",
        actor_user_id: context.userId,
        details: {
          queue_id: qid,
          reference_id: meta.reference_id,
          item_name: meta.item_name,
          previous_cost: meta.meta?.current_cost ?? null,
          proposed_cost: meta.meta?.proposed_cost ?? null,
          percent_change: meta.meta?.percent_change ?? null,
          source: meta.meta?.source ?? null,
          notes: data.notes ?? null,
          error: error?.message ?? null,
        },
      });
    }
    const ok_count = results.filter((r) => r.ok).length;
    return {
      count: results.length,
      ok_count,
      fail_count: results.length - ok_count,
      results,
    };
  });

export const bulkRejectCostUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const results: BulkResult[] = [];
    for (const qid of data.queue_ids) {
      const meta = await loadQueueRowMeta(qid);
      const { error } = await supabaseAdmin.rpc("reject_cost_update", {
        _queue_id: qid,
        _notes: data.notes ?? undefined,
      });
      const ok = !error;
      results.push({
        queue_id: qid,
        ok,
        error: error?.message,
        reference_id: meta.reference_id,
        item_name: meta.item_name,
      });
      await supabaseAdmin.from("access_audit_log").insert({
        action: ok ? "cost_update_bulk_rejected" : "cost_update_bulk_reject_failed",
        actor_user_id: context.userId,
        details: {
          queue_id: qid,
          reference_id: meta.reference_id,
          item_name: meta.item_name,
          previous_cost: meta.meta?.current_cost ?? null,
          proposed_cost: meta.meta?.proposed_cost ?? null,
          percent_change: meta.meta?.percent_change ?? null,
          source: meta.meta?.source ?? null,
          notes: data.notes ?? null,
          error: error?.message ?? null,
        },
      });
    }
    const ok_count = results.filter((r) => r.ok).length;
    return {
      count: results.length,
      ok_count,
      fail_count: results.length - ok_count,
      results,
    };
  });

// ---------- Cost breakdown ----------

export const getCostBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BreakdownSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("ingredient_reference")
      .select(
        "id,canonical_name,default_unit,category,kroger_unit_cost,kroger_unit_cost_updated_at,manual_unit_cost,manual_unit_cost_updated_at,historical_avg_unit_cost,historical_avg_updated_at,internal_estimated_unit_cost,internal_estimated_unit_cost_updated_at,internal_cost_weights,inventory_item_id",
      )
      .eq("id", data.reference_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Item not found");

    const k = row.kroger_unit_cost == null ? null : Number(row.kroger_unit_cost);
    const m = row.manual_unit_cost == null ? null : Number(row.manual_unit_cost);
    const h = row.historical_avg_unit_cost == null ? null : Number(row.historical_avg_unit_cost);

    let wK = k != null ? 0.4 : 0;
    let wM = m != null ? 0.4 : 0;
    let wH = h != null ? 0.2 : 0;
    const totalW = wK + wM + wH;
    if (totalW > 0) {
      wK = wK / totalW;
      wM = wM / totalW;
      wH = wH / totalW;
    }
    const computed = totalW === 0 ? null : (k ?? 0) * wK + (m ?? 0) * wM + (h ?? 0) * wH;

    const { count: recipeCount } = await supabaseAdmin
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true })
      .eq("reference_id", data.reference_id);

    const { data: pending } = await supabaseAdmin
      .from("cost_update_queue")
      .select("id,source,current_cost,proposed_cost,percent_change,created_at")
      .eq("reference_id", data.reference_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    return {
      item: row,
      sources: {
        kroger: { value: k, available: k != null, base_weight: 0.4, applied_weight: wK },
        manual: { value: m, available: m != null, base_weight: 0.4, applied_weight: wM },
        historical: { value: h, available: h != null, base_weight: 0.2, applied_weight: wH },
      },
      computed_estimate: computed,
      stored_estimate: row.internal_estimated_unit_cost == null ? null : Number(row.internal_estimated_unit_cost),
      recipe_usage_count: recipeCount ?? 0,
      pending_queue_entry: pending?.[0] ?? null,
    };
  });

// ---------- NEW: Recompute & verify ----------
//
// Recalculates internal_estimated_unit_cost from the weighted inputs (Kroger 40 / Manual 40 / Historical 20)
// and reports any mismatches between stored vs computed estimates, missing sources, and abnormal deltas.
// READ-ONLY by default — does not mutate data; surfaces an audit-friendly report so admins can decide what to fix.

type SourceFlag = "missing_kroger" | "missing_manual" | "missing_historical";

type VerifyRow = {
  reference_id: string;
  canonical_name: string;
  default_unit: string;
  stored_estimate: number | null;
  computed_estimate: number | null;
  delta_pct: number | null;
  abnormal: boolean;
  no_sources: boolean;
  missing_sources: SourceFlag[];
  applied_weights: { kroger: number; manual: number; historical: number };
  inputs: { kroger: number | null; manual: number | null; historical: number | null };
};

export const recomputeAndVerifyInternalCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecomputeSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const abnormalDelta = data.abnormal_delta_pct ?? 0.05; // default ±5%

    let q = supabaseAdmin
      .from("ingredient_reference")
      .select(
        "id,canonical_name,default_unit,kroger_unit_cost,manual_unit_cost,historical_avg_unit_cost,internal_estimated_unit_cost",
      )
      .order("canonical_name", { ascending: true })
      .limit(2000);
    if (data.reference_ids && data.reference_ids.length > 0) {
      q = q.in("id", data.reference_ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const out: VerifyRow[] = [];
    for (const r of rows ?? []) {
      const k = r.kroger_unit_cost == null ? null : Number(r.kroger_unit_cost);
      const m = r.manual_unit_cost == null ? null : Number(r.manual_unit_cost);
      const h = r.historical_avg_unit_cost == null ? null : Number(r.historical_avg_unit_cost);

      let wK = k != null ? 0.4 : 0;
      let wM = m != null ? 0.4 : 0;
      let wH = h != null ? 0.2 : 0;
      const totalW = wK + wM + wH;
      if (totalW > 0) {
        wK = wK / totalW;
        wM = wM / totalW;
        wH = wH / totalW;
      }
      const computed = totalW === 0 ? null : (k ?? 0) * wK + (m ?? 0) * wM + (h ?? 0) * wH;
      const stored = r.internal_estimated_unit_cost == null ? null : Number(r.internal_estimated_unit_cost);

      let deltaPct: number | null = null;
      if (computed != null && stored != null && stored > 0) {
        deltaPct = (computed - stored) / stored;
      }
      const abnormal = deltaPct != null && Math.abs(deltaPct) > abnormalDelta;

      const missing: SourceFlag[] = [];
      if (k == null) missing.push("missing_kroger");
      if (m == null) missing.push("missing_manual");
      if (h == null) missing.push("missing_historical");

      out.push({
        reference_id: r.id,
        canonical_name: r.canonical_name,
        default_unit: r.default_unit,
        stored_estimate: stored,
        computed_estimate: computed == null ? null : Math.round(computed * 10000) / 10000,
        delta_pct: deltaPct == null ? null : Math.round(deltaPct * 10000) / 10000,
        abnormal,
        no_sources: totalW === 0,
        missing_sources: missing,
        applied_weights: {
          kroger: Math.round(wK * 1000) / 1000,
          manual: Math.round(wM * 1000) / 1000,
          historical: Math.round(wH * 1000) / 1000,
        },
        inputs: { kroger: k, manual: m, historical: h },
      });
    }

    const summary = {
      checked: out.length,
      no_sources: out.filter((r) => r.no_sources).length,
      abnormal: out.filter((r) => r.abnormal).length,
      missing_kroger: out.filter((r) => r.missing_sources.includes("missing_kroger")).length,
      missing_manual: out.filter((r) => r.missing_sources.includes("missing_manual")).length,
      missing_historical: out.filter((r) => r.missing_sources.includes("missing_historical")).length,
      delta_threshold_pct: abnormalDelta,
    };

    await supabaseAdmin.from("access_audit_log").insert({
      action: "cost_recompute_verify",
      actor_user_id: context.userId,
      details: { summary, scoped: !!data.reference_ids?.length },
    });

    return { summary, rows: out };
  });

// ---------- Receipt match review ----------

export const listLowConfidenceReceiptMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LowConfSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const threshold = data.confidence_threshold ?? 0.6;
    const limit = data.limit ?? 50;
    const { data: receipts, error } = await supabaseAdmin
      .from("receipts")
      .select("id,receipt_date,supplier_id,extracted_line_items,status,created_at")
      .in("status", ["reviewed", "processed"])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    type Row = {
      receipt_id: string;
      receipt_date: string | null;
      line_index: number;
      item_name: string;
      quantity: number;
      unit: string;
      unit_price: number;
      matched_inventory_id: string | null;
      matched_inventory_name: string | null;
      match_score: number | null;
      match_source: string | null;
    };
    const out: Row[] = [];
    for (const r of receipts ?? []) {
      const items = Array.isArray(r.extracted_line_items) ? (r.extracted_line_items as any[]) : [];
      items.forEach((it, idx) => {
        const score = it.match_score == null ? null : Number(it.match_score);
        const unmatched = !it.matched_inventory_id;
        const lowConf = score != null && score < threshold;
        if (unmatched || lowConf) {
          out.push({
            receipt_id: r.id,
            receipt_date: r.receipt_date,
            line_index: idx,
            item_name: String(it.item_name ?? ""),
            quantity: Number(it.quantity ?? 0),
            unit: String(it.unit ?? ""),
            unit_price: Number(it.unit_price ?? 0),
            matched_inventory_id: it.matched_inventory_id ?? null,
            matched_inventory_name: it.matched_inventory_name ?? null,
            match_score: score,
            match_source: it.match_source ?? null,
          });
        }
      });
    }
    return out;
  });

export const setReceiptLineItemMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetMatchSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("receipts")
      .select("extracted_line_items")
      .eq("id", data.receipt_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Receipt not found");
    const items = Array.isArray(row.extracted_line_items) ? [...(row.extracted_line_items as any[])] : [];
    if (data.line_index < 0 || data.line_index >= items.length) {
      throw new Error("Invalid line_index");
    }

    let invName: string | null = null;
    let invUnit: string | null = null;
    let invCost: number | null = null;
    if (data.inventory_item_id) {
      const { data: inv } = await supabaseAdmin
        .from("inventory_items")
        .select("name,unit,average_cost_per_unit")
        .eq("id", data.inventory_item_id)
        .maybeSingle();
      invName = inv?.name ?? null;
      invUnit = inv?.unit ?? null;
      invCost = inv?.average_cost_per_unit == null ? null : Number(inv.average_cost_per_unit);
    }
    const prev = items[data.line_index] ?? {};
    const previousSource = prev.match_source ?? null;
    const previousScore = prev.match_score ?? null;
    const previousInventoryId = prev.matched_inventory_id ?? null;
    const previousInventoryName = prev.matched_inventory_name ?? null;
    items[data.line_index] = {
      ...prev,
      matched_inventory_id: data.inventory_item_id,
      matched_inventory_name: invName,
      match_source: data.inventory_item_id ? "manual_review" : null,
      match_score: data.inventory_item_id ? 1.0 : null,
    };
    const { error: upErr } = await supabaseAdmin
      .from("receipts")
      .update({ extracted_line_items: items })
      .eq("id", data.receipt_id);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("access_audit_log").insert({
      action: data.inventory_item_id ? "receipt_line_item_matched" : "receipt_line_item_match_cleared",
      actor_user_id: context.userId,
      details: {
        receipt_id: data.receipt_id,
        line_index: data.line_index,
        item_name: items[data.line_index]?.item_name ?? null,
        inventory_item_id: data.inventory_item_id,
        inventory_item_name: invName,
        previous_inventory_id: previousInventoryId,
        previous_inventory_name: previousInventoryName,
        previous_match_source: previousSource,
        previous_match_score: previousScore,
        new_match_source: data.inventory_item_id ? "manual_review" : null,
      },
    });

    return {
      success: true,
      previous: {
        inventory_id: previousInventoryId,
        inventory_name: previousInventoryName,
        match_source: previousSource,
        match_score: previousScore,
      },
      next: {
        inventory_id: data.inventory_item_id,
        inventory_name: invName,
        inventory_unit: invUnit,
        inventory_cost: invCost,
        match_source: data.inventory_item_id ? "manual_review" : null,
        match_score: data.inventory_item_id ? 1.0 : null,
      },
    };
  });

export const searchInventoryItemsForMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SearchInvSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("inventory_items")
      .select("id,name,unit,category,average_cost_per_unit")
      .ilike("name", `%${data.query}%`)
      .order("name")
      .limit(data.limit ?? 25);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Simulate apply (READ-ONLY) ----------
//
// For one or more pending queue rows, project the exact downstream impact:
//   1. New ingredient_reference.internal_estimated_unit_cost (weighted recompute)
//   2. New inventory_items.average_cost_per_unit for the linked inventory item
//   3. Per-recipe cost_per_serving delta (ingredient quantities × new costs)
//   4. Per-quote subtotal delta (sum of recipe deltas × quote_items.quantity)
//
// NO writes occur. Returns a structured report the UI can render.

type SimItemImpact = {
  inventory_item_id: string;
  inventory_name: string;
  current_avg_cost: number | null;
  projected_avg_cost: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
};

type SimRecipeImpact = {
  recipe_id: string;
  recipe_name: string;
  servings: number;
  current_cost_per_serving: number | null;
  projected_cost_per_serving: number;
  delta_per_serving: number;
  delta_pct: number | null;
};

type SimQuoteImpact = {
  quote_id: string;
  client_name: string | null;
  status: string | null;
  event_date: string | null;
  guest_count: number | null;
  affected_items: number;
  current_subtotal: number;
  projected_subtotal: number;
  delta_abs: number;
  delta_pct: number | null;
};

type SimQueueRow = {
  queue_id: string;
  reference_id: string;
  canonical_name: string;
  default_unit: string;
  source: string;
  current_estimate: number | null;
  proposed_estimate: number;
  estimate_delta_pct: number | null;
};

export type SimValidationSeverity = "error" | "warning" | "info";
export type SimValidationCode =
  | "missing_reference"
  | "no_inventory_link"
  | "no_recipe_usage"
  | "no_inventory_or_recipe"
  | "ref_already_actioned"
  | "duplicate_reference";

export type SimValidationIssue = {
  queue_id: string;
  reference_id: string | null;
  item_name: string | null;
  code: SimValidationCode;
  severity: SimValidationSeverity;
  message: string;
  hint: string;
};

export const simulateApplyCostUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SimulateSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);

    // 1. Load queue rows
    const { data: queueRows, error: qErr } = await supabaseAdmin
      .from("cost_update_queue")
      .select("id,reference_id,source,current_cost,proposed_cost,proposed_kroger_cost,proposed_manual_cost,proposed_historical_cost,status")
      .in("id", data.queue_ids);
    if (qErr) throw new Error(qErr.message);
    const pending = (queueRows ?? []).filter((r) => r.status === "pending");
    if (pending.length === 0) {
      return {
        summary: { queue_rows: 0, inventory_items: 0, recipes: 0, quotes: 0, total_quote_delta: 0 },
        queue: [] as SimQueueRow[],
        inventory: [] as SimItemImpact[],
        recipes: [] as SimRecipeImpact[],
        quotes: [] as SimQuoteImpact[],
        warnings: ["No pending rows in selection."],
      };
    }

    const refIds = Array.from(new Set(pending.map((r) => r.reference_id)));

    // 2. Load reference rows (current weighted inputs)
    const { data: refs } = await supabaseAdmin
      .from("ingredient_reference")
      .select("id,canonical_name,default_unit,inventory_item_id,kroger_unit_cost,manual_unit_cost,historical_avg_unit_cost,internal_estimated_unit_cost")
      .in("id", refIds);
    const refMap = new Map((refs ?? []).map((r: any) => [r.id, r]));

    // 3. For each queue row, compute the projected weighted estimate
    //    using existing inputs + the proposed override for its source.
    function weighted(k: number | null, m: number | null, h: number | null): number | null {
      let wK = k != null ? 0.4 : 0;
      let wM = m != null ? 0.4 : 0;
      let wH = h != null ? 0.2 : 0;
      const total = wK + wM + wH;
      if (total === 0) return null;
      wK /= total; wM /= total; wH /= total;
      return (k ?? 0) * wK + (m ?? 0) * wM + (h ?? 0) * wH;
    }

    const queue: SimQueueRow[] = [];
    // Map reference_id → projected internal estimate (last-write-wins if duplicate refs)
    const projectedRefCost = new Map<string, number>();

    for (const r of pending) {
      const ref: any = refMap.get(r.reference_id);
      if (!ref) continue;
      const k = r.proposed_kroger_cost != null ? Number(r.proposed_kroger_cost) :
                ref.kroger_unit_cost != null ? Number(ref.kroger_unit_cost) : null;
      const m = r.proposed_manual_cost != null ? Number(r.proposed_manual_cost) :
                ref.manual_unit_cost != null ? Number(ref.manual_unit_cost) : null;
      const h = r.proposed_historical_cost != null ? Number(r.proposed_historical_cost) :
                ref.historical_avg_unit_cost != null ? Number(ref.historical_avg_unit_cost) : null;
      // If proposed_cost was provided directly (older queue rows), use it as a fallback.
      let projected = weighted(k, m, h);
      if (projected == null && r.proposed_cost != null) projected = Number(r.proposed_cost);
      if (projected == null) continue;

      const current = ref.internal_estimated_unit_cost == null ? null : Number(ref.internal_estimated_unit_cost);
      const deltaPct = current != null && current > 0 ? (projected - current) / current : null;
      queue.push({
        queue_id: r.id,
        reference_id: r.reference_id,
        canonical_name: ref.canonical_name,
        default_unit: ref.default_unit,
        source: r.source,
        current_estimate: current,
        proposed_estimate: Math.round(projected * 10000) / 10000,
        estimate_delta_pct: deltaPct == null ? null : Math.round(deltaPct * 10000) / 10000,
      });
      projectedRefCost.set(r.reference_id, projected);
    }

    // 4. Project inventory_items.average_cost_per_unit for the linked inventory items.
    //    Mirrors apply behavior: average_cost_per_unit follows the internal estimate.
    const invIds = Array.from(new Set(
      Array.from(projectedRefCost.keys())
        .map((id) => (refMap.get(id) as any)?.inventory_item_id)
        .filter(Boolean) as string[],
    ));
    const inventory: SimItemImpact[] = [];
    const projectedInvCost = new Map<string, number>(); // inventory_item_id → new avg cost
    if (invIds.length > 0) {
      const { data: invRows } = await supabaseAdmin
        .from("inventory_items")
        .select("id,name,average_cost_per_unit")
        .in("id", invIds);
      const invMap = new Map((invRows ?? []).map((r: any) => [r.id, r]));
      for (const refId of projectedRefCost.keys()) {
        const ref: any = refMap.get(refId);
        if (!ref?.inventory_item_id) continue;
        const inv: any = invMap.get(ref.inventory_item_id);
        if (!inv) continue;
        const proj = projectedRefCost.get(refId)!;
        const current = inv.average_cost_per_unit == null ? null : Number(inv.average_cost_per_unit);
        const deltaAbs = current == null ? null : proj - current;
        const deltaPct = current != null && current > 0 ? (proj - current) / current : null;
        projectedInvCost.set(ref.inventory_item_id, proj);
        inventory.push({
          inventory_item_id: ref.inventory_item_id,
          inventory_name: inv.name,
          current_avg_cost: current,
          projected_avg_cost: Math.round(proj * 10000) / 10000,
          delta_abs: deltaAbs == null ? null : Math.round(deltaAbs * 10000) / 10000,
          delta_pct: deltaPct == null ? null : Math.round(deltaPct * 10000) / 10000,
        });
      }
    }

    // 5. Find affected recipes via recipe_ingredients linked by reference_id OR inventory_item_id.
    //    For each, recompute projected cost_per_serving.
    const refIdsArr = Array.from(projectedRefCost.keys());
    const invIdsArr = Array.from(projectedInvCost.keys());
    let riQuery = supabaseAdmin
      .from("recipe_ingredients")
      .select("recipe_id,reference_id,inventory_item_id,quantity,cost_per_unit");
    if (refIdsArr.length > 0 && invIdsArr.length > 0) {
      riQuery = riQuery.or(`reference_id.in.(${refIdsArr.join(",")}),inventory_item_id.in.(${invIdsArr.join(",")})`);
    } else if (refIdsArr.length > 0) {
      riQuery = riQuery.in("reference_id", refIdsArr);
    } else if (invIdsArr.length > 0) {
      riQuery = riQuery.in("inventory_item_id", invIdsArr);
    } else {
      riQuery = riQuery.eq("recipe_id", "00000000-0000-0000-0000-000000000000"); // empty
    }
    const { data: affectedRI } = await riQuery;
    const affectedRecipeIds = Array.from(new Set((affectedRI ?? []).map((r: any) => r.recipe_id)));

    const recipes: SimRecipeImpact[] = [];
    if (affectedRecipeIds.length > 0) {
      // Load all ingredients for those recipes (need full set to recompute total ingredient cost)
      const { data: allRI } = await supabaseAdmin
        .from("recipe_ingredients")
        .select("recipe_id,reference_id,inventory_item_id,quantity,cost_per_unit")
        .in("recipe_id", affectedRecipeIds);
      const { data: recipeRows } = await supabaseAdmin
        .from("recipes")
        .select("id,name,servings,cost_per_serving")
        .in("id", affectedRecipeIds);
      const rMap = new Map((recipeRows ?? []).map((r: any) => [r.id, r]));

      // Group ingredients by recipe
      const grouped = new Map<string, any[]>();
      for (const ing of allRI ?? []) {
        const arr = grouped.get(ing.recipe_id) ?? [];
        arr.push(ing);
        grouped.set(ing.recipe_id, arr);
      }
      for (const [rid, ings] of grouped) {
        const recipe: any = rMap.get(rid);
        if (!recipe) continue;
        const servings = Number(recipe.servings ?? 1) || 1;
        let totalCost = 0;
        for (const ing of ings) {
          const qty = Number(ing.quantity ?? 0);
          // Pick projected cost: prefer ref-based projection, then inv-based, else stored cost_per_unit
          let unitCost: number | null = null;
          if (ing.reference_id && projectedRefCost.has(ing.reference_id)) {
            unitCost = projectedRefCost.get(ing.reference_id)!;
          } else if (ing.inventory_item_id && projectedInvCost.has(ing.inventory_item_id)) {
            unitCost = projectedInvCost.get(ing.inventory_item_id)!;
          } else if (ing.cost_per_unit != null) {
            unitCost = Number(ing.cost_per_unit);
          }
          if (unitCost != null) totalCost += qty * unitCost;
        }
        const projected = totalCost / servings;
        const current = recipe.cost_per_serving == null ? null : Number(recipe.cost_per_serving);
        const delta = current == null ? projected : projected - current;
        const deltaPct = current != null && current > 0 ? (projected - current) / current : null;
        recipes.push({
          recipe_id: rid,
          recipe_name: recipe.name,
          servings,
          current_cost_per_serving: current,
          projected_cost_per_serving: Math.round(projected * 10000) / 10000,
          delta_per_serving: Math.round(delta * 10000) / 10000,
          delta_pct: deltaPct == null ? null : Math.round(deltaPct * 10000) / 10000,
        });
      }
    }

    // 6. Quote impact: only consider non-archived, future or recent quotes.
    const recipeDeltaMap = new Map(recipes.map((r) => [r.recipe_id, r.delta_per_serving]));
    const quotes: SimQuoteImpact[] = [];
    if (recipes.length > 0) {
      const recipeIds = recipes.map((r) => r.recipe_id);
      const { data: qItems } = await supabaseAdmin
        .from("quote_items")
        .select("quote_id,recipe_id,quantity,total_price")
        .in("recipe_id", recipeIds);
      const quoteIds = Array.from(new Set((qItems ?? []).map((r: any) => r.quote_id)));
      let activeQuoteIds: string[] = [];
      let qMeta = new Map<string, any>();
      if (quoteIds.length > 0) {
        const { data: qRows } = await supabaseAdmin
          .from("quotes")
          .select("id,client_name,status,event_date,guest_count,subtotal")
          .in("id", quoteIds);
        for (const q of qRows ?? []) {
          // Skip archived/lost terminal states
          if (q.status === "archived" || q.status === "lost" || q.status === "cancelled") continue;
          activeQuoteIds.push(q.id);
          qMeta.set(q.id, q);
        }
      }
      // Group items by quote
      const itemsByQuote = new Map<string, any[]>();
      for (const it of qItems ?? []) {
        if (!activeQuoteIds.includes(it.quote_id)) continue;
        const arr = itemsByQuote.get(it.quote_id) ?? [];
        arr.push(it);
        itemsByQuote.set(it.quote_id, arr);
      }
      for (const [qid, items] of itemsByQuote) {
        const meta = qMeta.get(qid);
        let delta = 0;
        let affected = 0;
        for (const it of items) {
          const d = recipeDeltaMap.get(it.recipe_id);
          if (d == null) continue;
          // Per-serving delta × quantity (servings/portions sold on the quote line)
          delta += d * Number(it.quantity ?? 0);
          affected += 1;
        }
        const current = Number(meta?.subtotal ?? 0);
        const projected = current + delta;
        const deltaPct = current > 0 ? delta / current : null;
        quotes.push({
          quote_id: qid,
          client_name: meta?.client_name ?? null,
          status: meta?.status ?? null,
          event_date: meta?.event_date ?? null,
          guest_count: meta?.guest_count ?? null,
          affected_items: affected,
          current_subtotal: Math.round(current * 100) / 100,
          projected_subtotal: Math.round(projected * 100) / 100,
          delta_abs: Math.round(delta * 100) / 100,
          delta_pct: deltaPct == null ? null : Math.round(deltaPct * 10000) / 10000,
        });
      }
      // Sort biggest impact first
      quotes.sort((a, b) => Math.abs(b.delta_abs) - Math.abs(a.delta_abs));
    }

    const totalQuoteDelta = quotes.reduce((s, q) => s + q.delta_abs, 0);
    const warnings: string[] = [];
    if (queue.length < data.queue_ids.length) {
      warnings.push(`${data.queue_ids.length - queue.length} selected row(s) skipped (already actioned or missing reference).`);
    }
    if (recipes.length === 0) {
      warnings.push("No recipes use these ingredients — only inventory cost would change.");
    }

    // Audit the simulation (read-only event)
    await supabaseAdmin.from("access_audit_log").insert({
      action: "cost_update_simulated",
      actor_user_id: context.userId,
      details: {
        queue_ids: data.queue_ids,
        queue_rows_simulated: queue.length,
        inventory_items_affected: inventory.length,
        recipes_affected: recipes.length,
        quotes_affected: quotes.length,
        total_quote_delta: Math.round(totalQuoteDelta * 100) / 100,
      },
    });

    return {
      summary: {
        queue_rows: queue.length,
        inventory_items: inventory.length,
        recipes: recipes.length,
        quotes: quotes.length,
        total_quote_delta: Math.round(totalQuoteDelta * 100) / 100,
      },
      queue,
      inventory,
      recipes,
      quotes,
      warnings,
    };
  });

// ---------- Cost queue timeline ----------
//
// Returns a chronological list of status transitions for a single queue row.
// Combines the queue row's own lifecycle (created / reviewed) with matching
// access_audit_log events (approve / reject / override / bulk variants), and
// resolves the approving admin's email by joining auth user records.

export type CostQueueTimelineEvent = {
  at: string;
  kind:
    | "created"
    | "approved"
    | "rejected"
    | "overridden"
    | "bulk_approved"
    | "bulk_rejected"
    | "bulk_approve_failed"
    | "bulk_reject_failed"
    | "reviewed"
    | "other";
  label: string;
  actor_email: string | null;
  actor_user_id: string | null;
  notes: string | null;
  details: Record<string, any>;
};

const AUDIT_KIND_MAP: Record<string, CostQueueTimelineEvent["kind"]> = {
  cost_update_approved: "approved",
  cost_update_rejected: "rejected",
  cost_update_overridden: "overridden",
  cost_update_bulk_approved: "bulk_approved",
  cost_update_bulk_rejected: "bulk_rejected",
  cost_update_bulk_approve_failed: "bulk_approve_failed",
  cost_update_bulk_reject_failed: "bulk_reject_failed",
};

const KIND_LABELS: Record<CostQueueTimelineEvent["kind"], string> = {
  created: "Queued for review",
  approved: "Approved & applied",
  rejected: "Rejected",
  overridden: "Manual override applied",
  bulk_approved: "Bulk approved",
  bulk_rejected: "Bulk rejected",
  bulk_approve_failed: "Bulk approve failed",
  bulk_reject_failed: "Bulk reject failed",
  reviewed: "Status finalised",
  other: "Event",
};

export const getCostQueueTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TimelineSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);

    // 1. Load the queue row (current state + linked item)
    const { data: row, error: rErr } = await supabaseAdmin
      .from("cost_update_queue")
      .select(
        "id,reference_id,source,current_cost,proposed_cost,percent_change,status,reviewed_by,reviewed_at,review_notes,final_applied_cost,created_at,ingredient_reference(canonical_name,default_unit)",
      )
      .eq("id", data.queue_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("Queue row not found");

    // 2. Load matching audit events for this queue row
    const { data: auditRows, error: aErr } = await supabaseAdmin
      .from("access_audit_log")
      .select("id,action,actor_user_id,actor_email,details,created_at")
      .in("action", Object.keys(AUDIT_KIND_MAP))
      .filter("details->>queue_id", "eq", data.queue_id)
      .order("created_at", { ascending: true });
    if (aErr) throw new Error(aErr.message);

    // 3. Resolve any actor user ids missing email via auth admin lookup
    const events: CostQueueTimelineEvent[] = [];

    events.push({
      at: row.created_at,
      kind: "created",
      label: KIND_LABELS.created,
      actor_email: null,
      actor_user_id: null,
      notes: null,
      details: {
        source: row.source,
        current_cost: row.current_cost,
        proposed_cost: row.proposed_cost,
        percent_change: row.percent_change,
      },
    });

    const seenIds = new Set<string>();
    for (const a of auditRows ?? []) {
      seenIds.add(a.id);
      const kind = AUDIT_KIND_MAP[a.action] ?? "other";
      const det = (a.details as Record<string, any>) ?? {};
      events.push({
        at: a.created_at,
        kind,
        label: KIND_LABELS[kind],
        actor_email: a.actor_email ?? null,
        actor_user_id: a.actor_user_id ?? null,
        notes: typeof det.notes === "string" ? det.notes : null,
        details: det,
      });
    }

    // If the queue row was reviewed but no matching audit row exists (legacy data),
    // synthesise a "reviewed" event so the timeline still shows finalisation.
    const hasTerminal = events.some((e) =>
      ["approved", "rejected", "overridden"].includes(e.kind),
    );
    if (!hasTerminal && row.reviewed_at) {
      events.push({
        at: row.reviewed_at,
        kind: "reviewed",
        label: `${KIND_LABELS.reviewed} (${row.status})`,
        actor_email: null,
        actor_user_id: row.reviewed_by ?? null,
        notes: row.review_notes ?? null,
        details: { status: row.status, final_applied_cost: row.final_applied_cost },
      });
    }

    // Resolve missing actor_email values via auth admin (best-effort)
    const missingActorIds = Array.from(
      new Set(events.filter((e) => !e.actor_email && e.actor_user_id).map((e) => e.actor_user_id!)),
    );
    if (missingActorIds.length > 0) {
      const emailMap = new Map<string, string>();
      for (const uid of missingActorIds) {
        try {
          const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(uid);
          const email = u?.user?.email ?? null;
          if (email) emailMap.set(uid, email);
        } catch {
          // ignore — email lookup is best-effort
        }
      }
      for (const e of events) {
        if (!e.actor_email && e.actor_user_id && emailMap.has(e.actor_user_id)) {
          e.actor_email = emailMap.get(e.actor_user_id) ?? null;
        }
      }
    }

    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      queue_id: data.queue_id,
      item_name: (row as any).ingredient_reference?.canonical_name ?? null,
      default_unit: (row as any).ingredient_reference?.default_unit ?? null,
      status: row.status,
      source: row.source,
      current_cost: row.current_cost,
      proposed_cost: row.proposed_cost,
      final_applied_cost: row.final_applied_cost,
      percent_change: row.percent_change,
      reviewed_at: row.reviewed_at,
      reviewed_by_email:
        events.find((e) => ["approved", "rejected", "overridden"].includes(e.kind))?.actor_email ?? null,
      events,
    };
  });
