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

// ---- Test Harness ---------------------------------------------------------
// Deterministic in-memory tests for the catalog validator.
// - 3 PASS cases: rows that should produce zero issues.
// - 3 FAIL cases: rows that should produce specific (type, severity) issues.
// All FAIL issues are persisted to pricing_v2_errors with stage=catalog so
// they show up on /admin/pricing-v2/errors and the module's Errors table.

type TestCase = {
  name: string;
  expect: "pass" | "fail";
  row: any;
  // For "fail" cases, the exact issue types we expect (order-independent).
  expectedTypes?: string[];
};

const TEST_CASES: TestCase[] = [
  // PASS
  {
    name: "PASS · fully mapped item (butter, 454g, lb)",
    expect: "pass",
    row: { id: "00000000-0000-0000-0000-000000000001", name: "TEST · Butter", kroger_product_id: "0001111041700", pack_weight_grams: 454, unit: "lb" },
  },
  {
    name: "PASS · small unit item (vanilla extract, 59g, oz)",
    expect: "pass",
    row: { id: "00000000-0000-0000-0000-000000000002", name: "TEST · Vanilla Extract", kroger_product_id: "0007225001234", pack_weight_grams: 59, unit: "oz" },
  },
  {
    name: "PASS · bulk item (flour, 2268g, lb)",
    expect: "pass",
    row: { id: "00000000-0000-0000-0000-000000000003", name: "TEST · AP Flour", kroger_product_id: "0001600027528", pack_weight_grams: 2268, unit: "lb" },
  },
  // FAIL
  {
    name: "FAIL · no Kroger mapping",
    expect: "fail",
    row: { id: "00000000-0000-0000-0000-000000000010", name: "TEST · Unmapped Sugar", kroger_product_id: null, pack_weight_grams: 907, unit: "lb" },
    expectedTypes: ["missing_kroger_mapping"],
  },
  {
    name: "FAIL · no pack weight",
    expect: "fail",
    row: { id: "00000000-0000-0000-0000-000000000011", name: "TEST · Weightless Salt", kroger_product_id: "0001111000123", pack_weight_grams: 0, unit: "oz" },
    expectedTypes: ["missing_pack_weight"],
  },
  {
    name: "FAIL · multi-issue (no mapping AND no weight AND no unit)",
    expect: "fail",
    row: { id: "00000000-0000-0000-0000-000000000012", name: "TEST · Empty Row", kroger_product_id: null, pack_weight_grams: null, unit: "" },
    expectedTypes: ["missing_kroger_mapping", "missing_pack_weight", "missing_unit"],
  },
];

export const runCatalogTestHarness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    // 1) Create a run record (stage=catalog so it shows up alongside real runs)
    const { data: run, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: STAGE,
        status: "running",
        triggered_by: userId ?? null,
        params: { test_harness: true },
        notes: "Stage 0 Catalog test harness",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);

    type Result = {
      name: string;
      expect: "pass" | "fail";
      passed: boolean;
      actualIssues: { type: string; severity: string; message: string }[];
      details: string;
    };
    const results: Result[] = [];
    const errorRowsToInsert: any[] = [];

    for (const tc of TEST_CASES) {
      const issues = validateRow(tc.row);
      const actualTypes = issues.map((i) => i.type).sort();

      let passed = false;
      let details = "";
      if (tc.expect === "pass") {
        passed = issues.length === 0;
        details = passed ? "No issues, as expected." : `Expected 0 issues, got ${issues.length}.`;
      } else {
        const expected = (tc.expectedTypes ?? []).slice().sort();
        passed =
          actualTypes.length === expected.length &&
          actualTypes.every((t, i) => t === expected[i]);
        details = passed
          ? `Produced expected issue types: ${expected.join(", ")}`
          : `Expected types [${expected.join(", ")}], got [${actualTypes.join(", ")}].`;
      }

      results.push({
        name: tc.name,
        expect: tc.expect,
        passed,
        actualIssues: issues.map((i) => ({ type: i.type, severity: i.severity, message: i.message })),
        details,
      });

      // Persist FAIL-case issues to pricing_v2_errors (so they appear in the
      // errors page with the right stage/type/severity). PASS-case rows
      // produce no issues by definition, so nothing to insert for them.
      for (const i of issues) {
        errorRowsToInsert.push({
          run_id: run.run_id,
          stage: STAGE,
          severity: i.severity,
          type: i.type,
          entity_type: "test_case",
          entity_id: i.entity_id,
          entity_name: `[TEST] ${i.entity_name}`,
          message: `[Test Harness] ${i.message}`,
          suggested_fix: i.suggested_fix,
          debug_json: { ...i.debug_json, test_case: tc.name },
        });
      }
    }

    if (errorRowsToInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("pricing_v2_errors")
        .insert(errorRowsToInsert);
      if (insErr) throw new Error(insErr.message);
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    const warnings = errorRowsToInsert.filter((r) => r.severity === "warning").length;
    const errors = errorRowsToInsert.filter((r) => r.severity === "error").length;
    const overall = failed === 0 ? "success" : "partial";

    await supabase
      .from("pricing_v2_runs")
      .update({
        status: overall,
        ended_at: new Date().toISOString(),
        counts_in: results.length,
        counts_out: passed,
        warnings_count: warnings,
        errors_count: errors,
      })
      .eq("run_id", run.run_id);

    return {
      run_id: run.run_id,
      overall_pass: failed === 0,
      summary: { total: results.length, passed, failed, errors_logged: errorRowsToInsert.length },
      results,
    };
  });
