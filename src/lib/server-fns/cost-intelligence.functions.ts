import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const listIngredientCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("ingredient_reference")
      .select(
        "id,canonical_name,default_unit,kroger_unit_cost,kroger_unit_cost_updated_at,manual_unit_cost,manual_unit_cost_updated_at,historical_avg_unit_cost,historical_avg_updated_at,internal_estimated_unit_cost,internal_estimated_unit_cost_updated_at,internal_cost_weights",
      )
      .order("canonical_name", { ascending: true })
      .limit(data.limit ?? 200);
    if (data.search && data.search.trim()) {
      q = q.ilike("canonical_name", `%${data.search.trim()}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCostUpdateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string } | undefined) => d ?? {})
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
  .inputValidator(
    (d: {
      reference_id: string;
      source: "kroger" | "manual" | "historical";
      kroger_cost?: number | null;
      manual_cost?: number | null;
      historical_cost?: number | null;
    }) => d,
  )
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
  .inputValidator((d: { queue_id: string; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("approve_cost_update", {
      _queue_id: data.queue_id,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const rejectCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_id: string; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("reject_cost_update", {
      _queue_id: data.queue_id,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const overrideCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_id: string; manual_cost: number; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("override_cost_update", {
      _queue_id: data.queue_id,
      _manual_cost: data.manual_cost,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const bulkApproveCostUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_ids: string[]; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const results: { queue_id: string; ok: boolean; error?: string }[] = [];
    for (const qid of data.queue_ids) {
      const { error } = await supabaseAdmin.rpc("approve_cost_update", {
        _queue_id: qid,
        _notes: data.notes ?? undefined,
      });
      results.push({ queue_id: qid, ok: !error, error: error?.message });
    }
    return { count: results.length, ok_count: results.filter((r) => r.ok).length, results };
  });

export const bulkRejectCostUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_ids: string[]; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const results: { queue_id: string; ok: boolean; error?: string }[] = [];
    for (const qid of data.queue_ids) {
      const { error } = await supabaseAdmin.rpc("reject_cost_update", {
        _queue_id: qid,
        _notes: data.notes ?? undefined,
      });
      results.push({ queue_id: qid, ok: !error, error: error?.message });
    }
    return { count: results.length, ok_count: results.filter((r) => r.ok).length, results };
  });

/**
 * Returns the per-source cost inputs for an item plus the redistributed weights
 * actually used to compute internal_estimated_unit_cost. Mirrors the logic used
 * by the DB function compute_internal_estimated_cost (Kroger 40 / Manual 40 / Historical 20).
 */
export const getCostBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference_id: string }) => d)
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
    const computed =
      totalW === 0
        ? null
        : (k ?? 0) * wK + (m ?? 0) * wM + (h ?? 0) * wH;

    // Recipe usage count (read-only)
    const { count: recipeCount } = await supabaseAdmin
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true })
      .eq("reference_id", data.reference_id);

    // Latest pending queue entry, if any
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

/**
 * Scans recent receipts for low-confidence or unmatched line items so admins
 * can review and assign the correct inventory item.
 */
export const listLowConfidenceReceiptMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confidence_threshold?: number; limit?: number } | undefined) => d ?? {})
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
  .inputValidator(
    (d: {
      receipt_id: string;
      line_index: number;
      inventory_item_id: string | null;
    }) => d,
  )
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
    if (data.inventory_item_id) {
      const { data: inv } = await supabaseAdmin
        .from("inventory_items")
        .select("name")
        .eq("id", data.inventory_item_id)
        .maybeSingle();
      invName = inv?.name ?? null;
    }
    const prev = items[data.line_index] ?? {};
    const previousSource = prev.match_source ?? null;
    const previousScore = prev.match_score ?? null;
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

    // Audit log entry for manual receipt line match
    await supabaseAdmin.from("access_audit_log").insert({
      action: data.inventory_item_id
        ? "receipt_line_item_matched"
        : "receipt_line_item_match_cleared",
      actor_user_id: context.userId,
      details: {
        receipt_id: data.receipt_id,
        line_index: data.line_index,
        item_name: items[data.line_index]?.item_name ?? null,
        inventory_item_id: data.inventory_item_id,
        inventory_item_name: invName,
        previous_match_source: previousSource,
        previous_match_score: previousScore,
        new_match_source: data.inventory_item_id ? "manual_review" : null,
      },
    });

    return { success: true };
  });

export const searchInventoryItemsForMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string; limit?: number }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const q = data.query.trim();
    if (!q) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("inventory_items")
      .select("id,name,unit,category,average_cost_per_unit")
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(data.limit ?? 25);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
