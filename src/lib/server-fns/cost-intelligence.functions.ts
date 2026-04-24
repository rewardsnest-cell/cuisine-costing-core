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
