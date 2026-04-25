// Pricing v2: server functions for runs, errors, and settings.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PRICING_V2_STAGES = [
  { key: "catalog",          label: "Stage 0 — Catalog (bootstrap)" },
  { key: "monthly_snapshot", label: "Stage 1 — Monthly Snapshot" },
  { key: "receipts",         label: "Stage 2 — Receipts" },
  { key: "normalize",        label: "Stage 3 — Normalize to cost_per_gram" },
  { key: "compute_costs",    label: "Stage 4 — Compute costs + warnings" },
  { key: "rollups",          label: "Stage 5 — Rollups (recipes + menus)" },
] as const;

export type PricingV2StageKey = typeof PRICING_V2_STAGES[number]["key"];

// ---- Stage status overview ------------------------------------------------

export const getPricingV2Overview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_runs")
      .select("stage, status, started_at, ended_at, warnings_count, errors_count, counts_in, counts_out")
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const lastByStage = new Map<string, any>();
    for (const row of (data ?? [])) {
      if (!lastByStage.has(row.stage)) lastByStage.set(row.stage, row);
    }
    return {
      stages: PRICING_V2_STAGES.map((s) => ({
        ...s,
        last: lastByStage.get(s.key) ?? null,
      })),
    };
  });

// ---- Errors list ----------------------------------------------------------

const errorFiltersSchema = z.object({
  stage: z.string().optional(),
  severity: z.string().optional(),
  type: z.string().optional(),
  limit: z.number().min(1).max(1000).default(200),
});

export const listPricingV2Errors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => errorFiltersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let query = supabase
      .from("pricing_v2_errors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.stage)    query = query.eq("stage", data.stage);
    if (data.severity) query = query.eq("severity", data.severity);
    if (data.type)     query = query.ilike("type", `%${data.type}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { errors: rows ?? [] };
  });

// ---- Settings -------------------------------------------------------------

const settingsSchema = z.object({
  kroger_store_id: z.string().min(1).max(64),
  kroger_zip: z.string().min(3).max(16),
  monthly_schedule_day: z.number().int().min(1).max(28),
  monthly_schedule_hour: z.number().int().min(0).max(23),
  warning_threshold_pct: z.number().min(0).max(100),
  zero_cost_blocking: z.boolean(),
  default_menu_multiplier: z.number().min(0.1).max(20),
});

export const getPricingV2Settings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { settings: data };
  });

export const savePricingV2Settings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_settings")
      .update(data)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ---- Health tiles (placeholders — wired to real queries later) ------------

export const getPricingV2Health = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;

    // Placeholder counts — modules will replace these with real queries.
    const [missingWeights, pendingApprovals, blockedRecipes, unmatchedReceipts] = await Promise.all([
      supabase.from("inventory_items").select("id", { count: "exact", head: true })
        .or("pack_weight_grams.is.null,pack_weight_grams.eq.0"),
      supabase.from("inventory_items").select("id", { count: "exact", head: true })
        .or("average_cost_per_unit.is.null,average_cost_per_unit.eq.0"),
      supabase.from("recipes").select("id", { count: "exact", head: true }).limit(0),
      supabase.from("pricing_v2_errors").select("id", { count: "exact", head: true })
        .eq("type", "unmatched_receipt_line"),
    ]);

    return {
      tiles: {
        missing_weights:     missingWeights.count ?? 0,
        pending_approvals:   pendingApprovals.count ?? 0,
        blocked_recipes:     blockedRecipes.count ?? 0,
        unmatched_receipts:  unmatchedReceipts.count ?? 0,
      },
    };
  });

// ---- Self test ------------------------------------------------------------

export const runPricingV2SelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const steps: Array<{ name: string; ok: boolean; detail?: string }> = [];
    const startedAt = new Date().toISOString();

    // 1) Create a run record under stage="self_test"
    let runId: string | null = null;
    try {
      const { data, error } = await supabase
        .from("pricing_v2_runs")
        .insert({
          stage: "self_test",
          status: "running",
          initiated_by: userId ?? null,
          notes: "Self-test diagnostic",
          counts_in: 0,
          counts_out: 0,
        })
        .select("run_id")
        .single();
      if (error) throw error;
      runId = data.run_id;
      steps.push({ name: "Create pricing_v2_runs row", ok: true, detail: `run_id=${runId}` });
    } catch (e: any) {
      steps.push({ name: "Create pricing_v2_runs row", ok: false, detail: e?.message });
    }

    // 2) Insert two sample errors (one warning, one error)
    let insertedErrorIds: string[] = [];
    if (runId) {
      try {
        const { data, error } = await supabase
          .from("pricing_v2_errors")
          .insert([
            {
              run_id: runId,
              stage: "self_test",
              severity: "warning",
              type: "self_test_warning",
              entity_type: "diagnostic",
              entity_id: "sample-1",
              message: "Self-test warning sample — no real issue.",
              suggested_fix: "Ignore. This row was created by Run Self Test.",
              debug_json: { source: "self-test", at: startedAt },
            },
            {
              run_id: runId,
              stage: "self_test",
              severity: "error",
              type: "self_test_error",
              entity_type: "diagnostic",
              entity_id: "sample-2",
              message: "Self-test error sample — no real issue.",
              suggested_fix: "Ignore. This row was created by Run Self Test.",
              debug_json: { source: "self-test", at: startedAt },
            },
          ])
          .select("id");
        if (error) throw error;
        insertedErrorIds = (data ?? []).map((r: any) => r.id);
        steps.push({
          name: "Insert sample warning + error",
          ok: insertedErrorIds.length === 2,
          detail: `inserted ${insertedErrorIds.length} rows`,
        });
      } catch (e: any) {
        steps.push({ name: "Insert sample warning + error", ok: false, detail: e?.message });
      }
    }

    // 3) Verify settings round-trip (read, write same values back, re-read)
    try {
      const { data: before, error: readErr } = await supabase
        .from("pricing_v2_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!before) throw new Error("settings row missing");

      const { error: updErr } = await supabase
        .from("pricing_v2_settings")
        .update({
          kroger_store_id: before.kroger_store_id,
          kroger_zip: before.kroger_zip,
          warning_threshold_pct: before.warning_threshold_pct,
        })
        .eq("id", 1);
      if (updErr) throw updErr;

      const { data: after, error: readErr2 } = await supabase
        .from("pricing_v2_settings")
        .select("kroger_store_id, kroger_zip, warning_threshold_pct")
        .eq("id", 1)
        .maybeSingle();
      if (readErr2) throw readErr2;

      const ok =
        after?.kroger_store_id === before.kroger_store_id &&
        after?.kroger_zip === before.kroger_zip &&
        Number(after?.warning_threshold_pct) === Number(before.warning_threshold_pct);

      steps.push({
        name: "Settings save + reload",
        ok,
        detail: ok ? "round-trip matched" : "values changed unexpectedly",
      });
    } catch (e: any) {
      steps.push({ name: "Settings save + reload", ok: false, detail: e?.message });
    }

    // 4) Finalize run record
    const pass = steps.every((s) => s.ok);
    if (runId) {
      await supabase
        .from("pricing_v2_runs")
        .update({
          status: pass ? "success" : "failed",
          ended_at: new Date().toISOString(),
          warnings_count: 1,
          errors_count: 1,
          counts_out: insertedErrorIds.length,
        })
        .eq("run_id", runId);
    }

    // 5) Return inserted error rows for on-screen display
    let sampleErrors: any[] = [];
    if (insertedErrorIds.length) {
      const { data } = await supabase
        .from("pricing_v2_errors")
        .select("*")
        .in("id", insertedErrorIds)
        .order("severity");
      sampleErrors = data ?? [];
    }

    return { pass, runId, steps, sampleErrors };
  });
