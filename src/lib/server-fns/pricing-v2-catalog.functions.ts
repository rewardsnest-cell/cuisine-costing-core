// Pricing v2 — Stage 0 Catalog (bootstrap) server functions.
// Validates the inventory catalog: every active item must have a Kroger
// product mapping, a positive pack weight (grams), and a unit value.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAGE = "catalog" as const;

// ---- Run controls ---------------------------------------------------------

const runInputSchema = z.object({
  dry_run: z.boolean().default(true),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  filter: z.string().max(200).optional(),
  entity_id: z.string().uuid().optional(),
});

type CatalogIssue = {
  entity_id: string;
  entity_name: string;
  type: string;
  severity: "warning" | "error";
  message: string;
  suggested_fix: string;
  debug_json: Record<string, any>;
};

function validateRow(row: any): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const base = {
    entity_id: row.id,
    entity_name: row.name,
    debug_json: {
      kroger_product_id: row.kroger_product_id,
      pack_weight_grams: row.pack_weight_grams,
      unit: row.unit,
      catalog_status: row.catalog_status,
    },
  };
  if (!row.kroger_product_id) {
    issues.push({
      ...base,
      type: "missing_kroger_mapping",
      severity: "error",
      message: `"${row.name}" has no Kroger product mapping.`,
      suggested_fix: "Set kroger_product_id (UPC or Kroger SKU) on the inventory item.",
    });
  }
  const w = Number(row.pack_weight_grams);
  if (!Number.isFinite(w) || w <= 0) {
    issues.push({
      ...base,
      type: "missing_pack_weight",
      severity: "error",
      message: `"${row.name}" has no pack weight in grams.`,
      suggested_fix: "Set pack_weight_grams (>0) on the inventory item.",
    });
  }
  if (!row.unit || String(row.unit).trim() === "") {
    issues.push({
      ...base,
      type: "missing_unit",
      severity: "warning",
      message: `"${row.name}" has no unit.`,
      suggested_fix: "Set the unit (e.g. each, lb, oz) on the inventory item.",
    });
  }
  return issues;
}

export const runCatalogStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // 1) Create run
    const { data: run, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: STAGE,
        status: "running",
        triggered_by: userId ?? null,
        params: data,
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);

    try {
      // 2) Pull candidate inventory rows
      let q = supabase
        .from("inventory_items")
        .select("id, name, unit, kroger_product_id, pack_weight_grams, catalog_status, category");
      if (data.entity_id) q = q.eq("id", data.entity_id);
      if (data.filter)    q = q.ilike("name", `%${data.filter}%`);
      if (data.limit)     q = q.limit(data.limit);

      const { data: rows, error: rowsErr } = await q;
      if (rowsErr) throw new Error(rowsErr.message);

      const inputCount = rows?.length ?? 0;
      let warnings = 0;
      let errors = 0;
      const allIssues: CatalogIssue[] = [];
      const validIds: string[] = [];

      for (const row of (rows ?? [])) {
        const issues = validateRow(row);
        if (issues.length === 0) {
          validIds.push(row.id);
        } else {
          for (const i of issues) {
            if (i.severity === "warning") warnings++;
            else errors++;
            allIssues.push(i);
          }
        }
      }

      // 3) Persist errors
      if (allIssues.length > 0) {
        const errorRows = allIssues.map((i) => ({
          run_id: run.run_id,
          stage: STAGE,
          severity: i.severity,
          type: i.type,
          entity_type: "inventory_item",
          entity_id: i.entity_id,
          entity_name: i.entity_name,
          message: i.message,
          suggested_fix: i.suggested_fix,
          debug_json: i.debug_json,
        }));
        // Insert in chunks to be safe
        for (let off = 0; off < errorRows.length; off += 500) {
          const chunk = errorRows.slice(off, off + 500);
          const { error: errIns } = await supabase
            .from("pricing_v2_errors")
            .insert(chunk);
          if (errIns) throw new Error(errIns.message);
        }
      }

      // 4) On wet runs, mark passing items as ready and failing as needing fix
      if (!data.dry_run && (rows?.length ?? 0) > 0) {
        const failingIds = Array.from(new Set(allIssues.map((i) => i.entity_id)));
        if (validIds.length > 0) {
          await supabase
            .from("inventory_items")
            .update({ catalog_status: "ready", catalog_validated_at: new Date().toISOString() })
            .in("id", validIds);
        }
        if (failingIds.length > 0) {
          await supabase
            .from("inventory_items")
            .update({ catalog_status: "needs_weight" })
            .in("id", failingIds);
        }
      }

      const status = errors > 0 ? "partial" : "success";
      const { error: updErr } = await supabase
        .from("pricing_v2_runs")
        .update({
          status,
          ended_at: new Date().toISOString(),
          counts_in: inputCount,
          counts_out: validIds.length,
          warnings_count: warnings,
          errors_count: errors,
        })
        .eq("run_id", run.run_id);
      if (updErr) throw new Error(updErr.message);

      return {
        run_id: run.run_id,
        status,
        dry_run: data.dry_run,
        counts_in: inputCount,
        counts_out: validIds.length,
        warnings,
        errors,
      };
    } catch (e: any) {
      await supabase
        .from("pricing_v2_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          last_error: e?.message ?? String(e),
        })
        .eq("run_id", run.run_id);
      throw e;
    }
  });

// ---- Catalog dashboard summary -------------------------------------------

export const getCatalogSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;

    const all = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true });

    const mapped = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .not("kroger_product_id", "is", null);

    const weighted = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .gt("pack_weight_grams", 0);

    const ready = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("catalog_status", "ready");

    const lastRun = await supabase
      .from("pricing_v2_runs")
      .select("run_id")
      .eq("stage", STAGE)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      tiles: {
        total:    all.count ?? 0,
        mapped:   mapped.count ?? 0,
        weighted: weighted.count ?? 0,
        ready:    ready.count ?? 0,
      },
      last_run: lastRun.data ?? null,
    };
  });

// ---- Recent runs ---------------------------------------------------------

export const listCatalogRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_runs")
      .select("id, status, started_at, ended_at, counts_in, counts_out, warnings_count, errors_count, params")
      .eq("stage", STAGE)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });

// ---- Trace one entity -----------------------------------------------------

export const traceCatalogEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entity_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    const { data: row, error } = await supabase
      .from("inventory_items")
      .select("id, name, unit, kroger_product_id, pack_weight_grams, catalog_status, catalog_notes, catalog_validated_at, category")
      .eq("id", data.entity_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { item: null, issues: [], recent_errors: [] };

    const issues = validateRow(row);

    const { data: recent } = await supabase
      .from("pricing_v2_errors")
      .select("created_at, run_id, severity, type, message, suggested_fix")
      .eq("stage", STAGE)
      .eq("entity_id", data.entity_id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      item: row,
      computed: {
        is_ready: issues.length === 0,
        cost_per_gram_ready: !!(row.kroger_product_id && Number(row.pack_weight_grams) > 0),
      },
      issues,
      recent_errors: recent ?? [],
    };
  });

// ---- Quick actions --------------------------------------------------------

export const resolveCatalogErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entity_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_errors")
      .update({ resolved_at: new Date().toISOString() })
      .eq("stage", STAGE)
      .eq("entity_id", data.entity_id)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
    return { success: true };
  });
