// Pricing v2 — Stage 4: Compute inventory cost_per_gram with safe recovery.
// Outputs proposed updates to pricing_v2_cost_update_queue. Auto-applies when
// the change is signal-sourced and below the configured threshold; otherwise
// queues for admin review. Every applied change is logged for audit.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Resolution = "signals" | "explicit_equivalence" | "last_approved" | "category_median";

interface ProposedUpdate {
  inventory_item_id: string;
  old_cost_per_gram: number | null;
  new_computed_cost_per_gram: number;
  resolution_source: Resolution;
  pct_change: number | null;
  requires_review: boolean;
  warning_flags: string[];
  signals_count: number;
}

// ---- Run Stage 4 -----------------------------------------------------------

export const runStage4ComputeCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    item_ids: z.array(z.string().uuid()).optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Load settings.
    const { data: settings } = await supabase
      .from("pricing_v2_settings")
      .select("auto_apply_threshold_pct, enable_category_median_fallback, zero_cost_blocking")
      .eq("id", 1)
      .maybeSingle();
    const threshold = Number(settings?.auto_apply_threshold_pct ?? 10);
    const medianEnabled = !!settings?.enable_category_median_fallback;

    // Create a run row.
    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: "compute_costs",
        status: "running",
        initiated_by: userId ?? null,
        notes: "Stage 4 — compute inventory cost per gram",
        counts_in: 0,
        counts_out: 0,
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId = runRow.run_id as string;

    // Load items to evaluate.
    let itemQuery = supabase
      .from("inventory_items")
      .select("id, name, category_for_median, cost_per_gram_live, last_approved_cost_per_gram, cost_equivalent_of, pricing_status");
    if (data.item_ids?.length) itemQuery = itemQuery.in("id", data.item_ids);
    const { data: items, error: itemErr } = await itemQuery;
    if (itemErr) throw new Error(itemErr.message);

    // Pull active signals for these items (one trip).
    const itemIds = (items ?? []).map((i: any) => i.id);
    const signalsByItem = new Map<string, number[]>();
    if (itemIds.length) {
      const { data: sigs } = await supabase
        .from("pricing_v2_cost_signals")
        .select("inventory_item_id, cost_per_gram, is_active")
        .in("inventory_item_id", itemIds)
        .eq("is_active", true);
      for (const s of sigs ?? []) {
        const arr = signalsByItem.get(s.inventory_item_id) ?? [];
        const v = Number(s.cost_per_gram);
        if (Number.isFinite(v) && v > 0) arr.push(v);
        signalsByItem.set(s.inventory_item_id, arr);
      }
    }

    // Category medians (computed from current live values where available).
    const categoryMedian = new Map<string, number>();
    if (medianEnabled) {
      const { data: catRows } = await supabase
        .from("inventory_items")
        .select("category_for_median, cost_per_gram_live")
        .not("category_for_median", "is", null)
        .not("cost_per_gram_live", "is", null);
      const buckets = new Map<string, number[]>();
      for (const r of catRows ?? []) {
        const cat = r.category_for_median as string;
        const v = Number(r.cost_per_gram_live);
        if (cat && Number.isFinite(v) && v > 0) {
          const arr = buckets.get(cat) ?? [];
          arr.push(v);
          buckets.set(cat, arr);
        }
      }
      for (const [cat, arr] of buckets.entries()) {
        arr.sort((a, b) => a - b);
        categoryMedian.set(cat, arr[Math.floor(arr.length / 2)]);
      }
    }

    // Equivalence cost lookup (live preferred, then last approved).
    const equivIds = (items ?? [])
      .map((i: any) => i.cost_equivalent_of)
      .filter((v: any) => !!v) as string[];
    const equivCost = new Map<string, number>();
    if (equivIds.length) {
      const { data: eq } = await supabase
        .from("inventory_items")
        .select("id, cost_per_gram_live, last_approved_cost_per_gram")
        .in("id", equivIds);
      for (const e of eq ?? []) {
        const v = Number(e.cost_per_gram_live ?? e.last_approved_cost_per_gram);
        if (Number.isFinite(v) && v > 0) equivCost.set(e.id, v);
      }
    }

    const proposals: ProposedUpdate[] = [];
    const blockedItemIds: string[] = [];
    const recoveredItemIds: string[] = [];

    for (const it of items ?? []) {
      const old = it.cost_per_gram_live != null ? Number(it.cost_per_gram_live) : null;
      let resolution: Resolution | null = null;
      let newCost: number | null = null;
      let signalsCount = 0;
      const warnings: string[] = [];

      // Step 0 — signals
      const sigs = signalsByItem.get(it.id) ?? [];
      if (sigs.length > 0) {
        newCost = sigs.reduce((a, b) => a + b, 0) / sigs.length;
        resolution = "signals";
        signalsCount = sigs.length;
      }
      // Step 1 — explicit equivalence
      if (newCost == null && it.cost_equivalent_of && equivCost.has(it.cost_equivalent_of)) {
        newCost = equivCost.get(it.cost_equivalent_of)!;
        resolution = "explicit_equivalence";
        warnings.push("fallback:explicit_equivalence");
      }
      // Step 2 — last approved
      if (newCost == null && it.last_approved_cost_per_gram != null) {
        const v = Number(it.last_approved_cost_per_gram);
        if (Number.isFinite(v) && v > 0) {
          newCost = v;
          resolution = "last_approved";
          warnings.push("fallback:last_approved");
        }
      }
      // Step 3 — category median
      if (newCost == null && medianEnabled && it.category_for_median && categoryMedian.has(it.category_for_median)) {
        newCost = categoryMedian.get(it.category_for_median)!;
        resolution = "category_median";
        warnings.push("fallback:category_median");
      }

      // Step 4 — block
      if (newCost == null || !(newCost > 0)) {
        blockedItemIds.push(it.id);
        await supabase.from("pricing_v2_errors").insert({
          run_id: runId,
          stage: "compute_costs",
          severity: "error",
          type: "MISSING_COST_PER_GRAM",
          entity_type: "inventory_item",
          entity_id: it.id,
          message: `No cost source could resolve cost_per_gram for "${it.name}"`,
          suggested_fix: "Add a cost signal, set cost_equivalent_of, or approve a manual cost.",
        });
        continue;
      }

      const pct = old != null && old > 0 ? Math.abs(newCost - old) / old : null;
      const requiresReview =
        resolution !== "signals" || (pct != null && pct >= threshold / 100);

      proposals.push({
        inventory_item_id: it.id,
        old_cost_per_gram: old,
        new_computed_cost_per_gram: newCost,
        resolution_source: resolution!,
        pct_change: pct,
        requires_review: requiresReview,
        warning_flags: warnings,
        signals_count: signalsCount,
      });

      if (resolution !== "signals") recoveredItemIds.push(it.id);
    }

    // Mark BLOCKED items + clear status for resolved items.
    if (blockedItemIds.length) {
      await supabase
        .from("inventory_items")
        .update({ pricing_status: "BLOCKED_MISSING_COST", pricing_status_updated_at: new Date().toISOString() })
        .in("id", blockedItemIds);
    }

    // Insert proposals.
    let autoApplied = 0;
    let queuedForReview = 0;
    for (const p of proposals) {
      const status = p.requires_review ? "pending" : "auto_applied";
      const { data: inserted, error: qErr } = await supabase
        .from("pricing_v2_cost_update_queue")
        .insert({
          run_id: runId,
          inventory_item_id: p.inventory_item_id,
          old_cost_per_gram: p.old_cost_per_gram,
          new_computed_cost_per_gram: p.new_computed_cost_per_gram,
          resolution_source: p.resolution_source,
          pct_change: p.pct_change,
          requires_review: p.requires_review,
          warning_flags: p.warning_flags,
          signals_count: p.signals_count,
          status,
          decided_by: status === "auto_applied" ? userId : null,
          decided_at: status === "auto_applied" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (qErr) continue;

      if (status === "auto_applied") {
        const newStatus = p.resolution_source === "signals" ? "OK" : "DEGRADED_FALLBACK";
        await supabase
          .from("inventory_items")
          .update({
            cost_per_gram_live: p.new_computed_cost_per_gram,
            last_approved_cost_per_gram: p.new_computed_cost_per_gram,
            pricing_status: newStatus,
            pricing_status_updated_at: new Date().toISOString(),
          })
          .eq("id", p.inventory_item_id);
        await supabase.from("pricing_v2_cost_apply_log").insert({
          queue_id: inserted?.id ?? null,
          inventory_item_id: p.inventory_item_id,
          old_cost_per_gram: p.old_cost_per_gram,
          new_cost_per_gram: p.new_computed_cost_per_gram,
          resolution_source: p.resolution_source,
          pct_change: p.pct_change,
          applied_by: userId,
          applied_via: "auto",
          notes: `Auto-applied (signals, change <${threshold}%)`,
        });
        autoApplied++;
      } else {
        queuedForReview++;
      }
    }

    await supabase
      .from("pricing_v2_runs")
      .update({
        status: "success",
        ended_at: new Date().toISOString(),
        counts_in: items?.length ?? 0,
        counts_out: proposals.length,
        warnings_count: recoveredItemIds.length,
        errors_count: blockedItemIds.length,
      })
      .eq("run_id", runId);

    return {
      run_id: runId,
      evaluated: items?.length ?? 0,
      auto_applied: autoApplied,
      queued_for_review: queuedForReview,
      blocked: blockedItemIds.length,
      recovered_via_fallback: recoveredItemIds.length,
    };
  });

// ---- Queue listing / approval / rejection ---------------------------------

export const listCostUpdateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    status: z.enum(["pending", "approved", "rejected", "auto_applied", "superseded", "all"]).default("pending"),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_cost_update_queue")
      .select("*, inventory_items!inner(id, name, category, pricing_status)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const decideCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    queue_id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    notes: z.string().max(1000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: row, error } = await supabase
      .from("pricing_v2_cost_update_queue")
      .select("*")
      .eq("id", data.queue_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Queue entry not found");
    if (row.status !== "pending") throw new Error(`Already ${row.status}`);

    if (data.decision === "reject") {
      await supabase
        .from("pricing_v2_cost_update_queue")
        .update({
          status: "rejected",
          decided_by: userId,
          decided_at: new Date().toISOString(),
          decision_notes: data.notes ?? null,
        })
        .eq("id", data.queue_id);
      return { ok: true, decision: "rejected" };
    }

    // approve: apply
    const newStatus = row.resolution_source === "signals" ? "OK" : "DEGRADED_FALLBACK";
    await supabase
      .from("inventory_items")
      .update({
        cost_per_gram_live: row.new_computed_cost_per_gram,
        last_approved_cost_per_gram: row.new_computed_cost_per_gram,
        pricing_status: newStatus,
        pricing_status_updated_at: new Date().toISOString(),
      })
      .eq("id", row.inventory_item_id);

    await supabase
      .from("pricing_v2_cost_update_queue")
      .update({
        status: "approved",
        decided_by: userId,
        decided_at: new Date().toISOString(),
        decision_notes: data.notes ?? null,
      })
      .eq("id", data.queue_id);

    await supabase.from("pricing_v2_cost_apply_log").insert({
      queue_id: row.id,
      inventory_item_id: row.inventory_item_id,
      old_cost_per_gram: row.old_cost_per_gram,
      new_cost_per_gram: row.new_computed_cost_per_gram,
      resolution_source: row.resolution_source,
      pct_change: row.pct_change,
      applied_by: userId,
      applied_via: "manual",
      notes: data.notes ?? null,
    });

    return { ok: true, decision: "approved" };
  });

// ---- Blocked items list ---------------------------------------------------

export const listBlockedInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, name, category, pricing_status, cost_equivalent_of, last_approved_cost_per_gram")
      .eq("pricing_status", "BLOCKED_MISSING_COST")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

// ---- Manual cost set (admin override) -------------------------------------

export const setManualInventoryCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    inventory_item_id: z.string().uuid(),
    cost_per_gram: z.number().positive(),
    notes: z.string().max(1000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: existing } = await supabase
      .from("inventory_items")
      .select("cost_per_gram_live")
      .eq("id", data.inventory_item_id)
      .maybeSingle();
    const oldCost = existing?.cost_per_gram_live != null ? Number(existing.cost_per_gram_live) : null;
    const pct = oldCost != null && oldCost > 0 ? Math.abs(data.cost_per_gram - oldCost) / oldCost : null;

    await supabase
      .from("inventory_items")
      .update({
        cost_per_gram_live: data.cost_per_gram,
        last_approved_cost_per_gram: data.cost_per_gram,
        pricing_status: "OK",
        pricing_status_updated_at: new Date().toISOString(),
      })
      .eq("id", data.inventory_item_id);

    await supabase.from("pricing_v2_cost_apply_log").insert({
      inventory_item_id: data.inventory_item_id,
      old_cost_per_gram: oldCost,
      new_cost_per_gram: data.cost_per_gram,
      resolution_source: "signals",
      pct_change: pct,
      applied_by: userId,
      applied_via: "manual",
      notes: data.notes ?? "Manual override",
    });

    return { ok: true };
  });
