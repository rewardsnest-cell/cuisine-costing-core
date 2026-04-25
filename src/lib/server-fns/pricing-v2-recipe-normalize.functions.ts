// Pricing v2 — Stage -1: Recipe Ingredient Weight Normalization.
//
// Converts every recipe_ingredients row to grams using the safest available
// source. Anything ambiguous is BLOCKED with a uniform pricing_v2_errors row
// so it can be reviewed before pricing runs.
//
// Conversion priority (per spec):
//   1) inventory-based  (each_weight_grams, then pack_weight_grams)
//   2) auto_table       (pricing_v2_unit_conversion_rules where !requires_density)
//   3) BLOCK            (no guessing, no inventing densities)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAGE = "recipe_weight_normalization" as const;
const TEST_STAGE = "recipe_weight_normalization_test" as const;

// ---- Inputs ---------------------------------------------------------------

const runSchema = z.object({
  dry_run: z.boolean().default(false),
  recipe_id: z.string().uuid().optional(),
  ingredient_id: z.string().uuid().optional(),
  include_already_normalized: z.boolean().default(false),
  limit: z.number().int().min(1).max(50_000).optional(),
});

// ---- Types ----------------------------------------------------------------

type ErrorType =
  | "UNMAPPED_INVENTORY"
  | "VOLUME_UNIT_NO_DENSITY"
  | "EACH_UNIT_NO_WEIGHT"
  | "ZERO_OR_NEG_GRAMS"
  | "UNKNOWN_UNIT";

type ErrorRow = {
  run_id: string;
  stage: typeof STAGE | typeof TEST_STAGE;
  severity: "warning" | "error";
  type: ErrorType | "TEST_ASSERTION_FAILED";
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  message: string;
  suggested_fix: string | null;
  debug_json: Record<string, any>;
};

type NormStatus =
  | "normalized"
  | "blocked_missing_weight"
  | "blocked_ambiguous_unit"
  | "blocked_unmapped_inventory";

type ConvOutcome =
  | { ok: true; grams: number; source: "inventory_weight" | "auto_table"; status: "normalized"; notes: string }
  | { ok: false; status: NormStatus; type: ErrorType; reason: string };

// ---- Pure conversion helper (used by runner + harness) --------------------

const EACH_UNITS = new Set(["each", "ea", "ct", "count", "slice", "piece", "pieces", "pc", "pcs", "unit", "units"]);

export function convertIngredientToGrams(input: {
  quantity: number;
  unit: string;
  inventory: { each_weight_grams: number | null; pack_weight_grams: number | null } | null;
  rule: { grams_per_unit: number | null; requires_density: boolean } | null;
}): ConvOutcome {
  const qty = Number(input.quantity);
  const unit = (input.unit ?? "").trim().toLowerCase();

  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      ok: false,
      status: "blocked_missing_weight",
      type: "ZERO_OR_NEG_GRAMS",
      reason: `Quantity ${input.quantity} is not a positive number.`,
    };
  }

  // 1) Inventory-based for "each"-style units.
  if (EACH_UNITS.has(unit)) {
    const perEach = input.inventory?.each_weight_grams ?? input.inventory?.pack_weight_grams ?? null;
    if (input.inventory && perEach && perEach > 0) {
      const grams = qty * Number(perEach);
      return {
        ok: true,
        grams,
        source: "inventory_weight",
        status: "normalized",
        notes: `${qty} ${unit} × ${perEach} g (inventory ${input.inventory.each_weight_grams ? "each" : "pack"} weight)`,
      };
    }
    if (!input.inventory) {
      return {
        ok: false,
        status: "blocked_unmapped_inventory",
        type: "UNMAPPED_INVENTORY",
        reason: `Unit "${unit}" needs an inventory mapping with a per-piece weight, but ingredient is not linked to inventory.`,
      };
    }
    return {
      ok: false,
      status: "blocked_ambiguous_unit",
      type: "EACH_UNIT_NO_WEIGHT",
      reason: `Unit "${unit}" needs each_weight_grams (or pack_weight_grams) on the linked inventory item.`,
    };
  }

  // 2) Rule-based (weight units only).
  if (input.rule) {
    if (input.rule.requires_density) {
      return {
        ok: false,
        status: "blocked_ambiguous_unit",
        type: "VOLUME_UNIT_NO_DENSITY",
        reason: `Unit "${unit}" is volume-based and requires a density, which is not defined.`,
      };
    }
    const gpu = Number(input.rule.grams_per_unit ?? 0);
    if (gpu > 0) {
      const grams = qty * gpu;
      return {
        ok: true,
        grams,
        source: "auto_table",
        status: "normalized",
        notes: `${qty} ${unit} × ${gpu} g/${unit} (auto_table)`,
      };
    }
  }

  // 3) Unknown unit.
  return {
    ok: false,
    status: "blocked_ambiguous_unit",
    type: "UNKNOWN_UNIT",
    reason: `Unit "${unit}" has no conversion rule and no inventory weight available.`,
  };
}

// ---- Runner ---------------------------------------------------------------

export const runRecipeNormalize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // 1) Create run row.
    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: STAGE,
        status: "running",
        initiated_by: userId ?? null,
        triggered_by: "ui",
        params: {
          dry_run: data.dry_run,
          recipe_id: data.recipe_id ?? null,
          ingredient_id: data.ingredient_id ?? null,
          include_already_normalized: data.include_already_normalized,
          limit: data.limit ?? null,
        },
        notes: data.dry_run ? "dry_run=true (recipe_weight_normalization)" : "recipe_weight_normalization",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId: string = runRow.run_id;

    let countsIn = 0;
    let countsOut = 0;
    const errors: ErrorRow[] = [];
    const breakdown: Record<string, number> = {
      UNMAPPED_INVENTORY: 0,
      VOLUME_UNIT_NO_DENSITY: 0,
      EACH_UNIT_NO_WEIGHT: 0,
      ZERO_OR_NEG_GRAMS: 0,
      UNKNOWN_UNIT: 0,
    };

    try {
      // 2) Load conversion rules into a map.
      const { data: rules, error: rulesErr } = await supabase
        .from("pricing_v2_unit_conversion_rules")
        .select("unit, grams_per_unit, requires_density");
      if (rulesErr) throw new Error(rulesErr.message);
      const ruleMap = new Map<string, { grams_per_unit: number | null; requires_density: boolean }>();
      for (const r of rules ?? []) {
        ruleMap.set(String(r.unit).toLowerCase(), {
          grams_per_unit: r.grams_per_unit != null ? Number(r.grams_per_unit) : null,
          requires_density: !!r.requires_density,
        });
      }

      // 3) Fetch ingredients (with inventory join).
      let q = supabase
        .from("recipe_ingredients")
        .select(
          "id, recipe_id, name, quantity, unit, inventory_item_id, normalization_status, " +
            "recipes:recipe_id(name), inventory:inventory_item_id(id, each_weight_grams, pack_weight_grams, name)"
        );
      if (data.recipe_id) q = q.eq("recipe_id", data.recipe_id);
      if (data.ingredient_id) q = q.eq("id", data.ingredient_id);
      if (!data.include_already_normalized) {
        q = q.or("normalization_status.is.null,normalization_status.neq.normalized");
      }
      if (data.limit) q = q.limit(data.limit);
      const { data: ings, error: ingErr } = await q;
      if (ingErr) throw new Error(ingErr.message);

      countsIn = (ings ?? []).length;

      // 4) Process each ingredient.
      for (const row of ings ?? []) {
        const inv = row.inventory
          ? {
              each_weight_grams: row.inventory.each_weight_grams != null ? Number(row.inventory.each_weight_grams) : null,
              pack_weight_grams: row.inventory.pack_weight_grams != null ? Number(row.inventory.pack_weight_grams) : null,
            }
          : null;
        const rule = ruleMap.get(String(row.unit ?? "").toLowerCase()) ?? null;

        const outcome = convertIngredientToGrams({
          quantity: Number(row.quantity),
          unit: row.unit,
          inventory: inv,
          rule,
        });

        const update: Record<string, any> = {
          original_quantity: row.quantity,
          original_unit: row.unit,
          last_normalize_run_id: runId,
        };
        if (outcome.ok) {
          update.quantity_grams = outcome.grams;
          update.conversion_source = outcome.source;
          update.conversion_notes = outcome.notes;
          update.normalization_status = outcome.status;
          countsOut += 1;
        } else {
          update.quantity_grams = null;
          update.conversion_source = null;
          update.conversion_notes = outcome.reason;
          update.normalization_status = outcome.status;
          breakdown[outcome.type] = (breakdown[outcome.type] ?? 0) + 1;
          errors.push({
            run_id: runId,
            stage: STAGE,
            severity: "error", // blocker per spec
            type: outcome.type,
            entity_type: "recipe_ingredient",
            entity_id: row.id,
            entity_name: `${row.recipes?.name ?? "(unknown recipe)"} → ${row.name}`,
            message: outcome.reason,
            suggested_fix:
              outcome.type === "UNMAPPED_INVENTORY"
                ? "Map this ingredient to an inventory item with each/pack weight."
                : outcome.type === "EACH_UNIT_NO_WEIGHT"
                  ? "Set each_weight_grams (or pack_weight_grams) on the linked inventory item."
                  : outcome.type === "VOLUME_UNIT_NO_DENSITY"
                    ? "Switch to a weight-based unit, or enter a manual grams override."
                    : outcome.type === "ZERO_OR_NEG_GRAMS"
                      ? "Set a positive quantity."
                      : "Use a known weight unit (g, kg, oz, lb) or set a manual grams override.",
            debug_json: {
              quantity: Number(row.quantity),
              unit: row.unit,
              inventory_item_id: row.inventory_item_id,
              has_inventory: !!row.inventory,
              each_weight_grams: inv?.each_weight_grams ?? null,
              pack_weight_grams: inv?.pack_weight_grams ?? null,
              rule_known: !!rule,
              rule,
            },
          });
        }

        if (!data.dry_run) {
          const { error: upErr } = await supabase
            .from("recipe_ingredients")
            .update(update)
            .eq("id", row.id);
          if (upErr) {
            errors.push({
              run_id: runId,
              stage: STAGE,
              severity: "error",
              type: "ZERO_OR_NEG_GRAMS",
              entity_type: "recipe_ingredient",
              entity_id: row.id,
              entity_name: `${row.recipes?.name ?? "?"} → ${row.name}`,
              message: `Update failed: ${upErr.message}`,
              suggested_fix: "Investigate database write error.",
              debug_json: { update },
            });
          }
        }
      }

      // 5) Persist errors (chunked).
      if (errors.length) {
        for (let i = 0; i < errors.length; i += 500) {
          await supabase.from("pricing_v2_errors").insert(errors.slice(i, i + 500));
        }
      }

      const errCount = errors.length;
      await supabase
        .from("pricing_v2_runs")
        .update({
          status: errCount > 0 ? "failed" : "succeeded",
          ended_at: new Date().toISOString(),
          counts_in: countsIn,
          counts_out: countsOut,
          warnings_count: 0,
          errors_count: errCount,
          last_error: errors[0]?.message ?? null,
        })
        .eq("run_id", runId);

      return {
        run_id: runId,
        dry_run: data.dry_run,
        counts_in: countsIn,
        counts_out: countsOut,
        blocked_count: errCount,
        warnings_count: 0,
        errors_count: errCount,
        breakdown,
      };
    } catch (e: any) {
      await supabase
        .from("pricing_v2_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          last_error: e?.message ?? String(e),
          counts_in: countsIn,
          counts_out: countsOut,
          errors_count: errors.length + 1,
        })
        .eq("run_id", runId);
      throw e;
    }
  });

// ---- Listings -------------------------------------------------------------

export const listNormalizeRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_runs")
      .select("run_id, status, started_at, ended_at, counts_in, counts_out, warnings_count, errors_count, params, notes, last_error, stage")
      .in("stage", [STAGE, TEST_STAGE])
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });

export const listNormalizeErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        run_id: z.string().uuid().optional(),
        type: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(1000).default(200),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_errors")
      .select("*")
      .in("stage", [STAGE, TEST_STAGE])
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.run_id) q = q.eq("run_id", data.run_id);
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { errors: rows ?? [] };
  });

// Blocked ingredients view (latest known status per row).
export const listBlockedIngredients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select(
        "id, recipe_id, name, quantity, unit, inventory_item_id, normalization_status, conversion_notes, " +
          "recipes:recipe_id(name)"
      )
      .neq("normalization_status", "normalized")
      .not("normalization_status", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// ---- Manual override ------------------------------------------------------

export const setIngredientManualGrams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ingredient_id: z.string().uuid(),
        grams: z.number().positive().max(1_000_000),
        reason: z.string().min(3).max(500),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row } = await supabase
      .from("recipe_ingredients")
      .select("quantity, unit")
      .eq("id", data.ingredient_id)
      .maybeSingle();
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({
        quantity_grams: data.grams,
        conversion_source: "manual_override",
        conversion_notes: `MANUAL: ${data.reason}`,
        normalization_status: "normalized",
        original_quantity: row?.quantity ?? null,
        original_unit: row?.unit ?? null,
      })
      .eq("id", data.ingredient_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Map ingredient to inventory (helper).
export const mapIngredientToInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ingredient_id: z.string().uuid(),
        inventory_item_id: z.string().uuid().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({ inventory_item_id: data.inventory_item_id })
      .eq("id", data.ingredient_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Trace ----------------------------------------------------------------

export const traceRecipeNormalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recipe_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id, name, status")
      .eq("id", data.recipe_id)
      .maybeSingle();
    const { data: ings, error } = await supabase
      .from("recipe_ingredients")
      .select(
        "id, name, quantity, unit, quantity_grams, normalization_status, conversion_source, conversion_notes, " +
          "inventory_item_id, original_quantity, original_unit, " +
          "inventory:inventory_item_id(name, each_weight_grams, pack_weight_grams)"
      )
      .eq("recipe_id", data.recipe_id);
    if (error) throw new Error(error.message);
    return { recipe, ingredients: ings ?? [] };
  });

// Lightweight recipe search for the trace picker.
export const searchRecipesForNormalize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().max(120).default("") }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase.from("recipes").select("id, name, status").order("name").limit(20);
    if (data.q.trim()) q = q.ilike("name", `%${data.q.trim()}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { recipes: rows ?? [] };
  });

// ---- Stage gate (used by Pricing Control Center) --------------------------

export const getRecipeNormalizationGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    // Count any non-normalized rows. NULL status counts as not-yet-normalized.
    const { count: blockedCount, error: e1 } = await supabase
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true })
      .or("normalization_status.is.null,normalization_status.neq.normalized");
    if (e1) throw new Error(e1.message);
    const { count: total, error: e2 } = await supabase
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true });
    if (e2) throw new Error(e2.message);
    const blocked = blockedCount ?? 0;
    return {
      total_ingredients: total ?? 0,
      blocked_ingredients: blocked,
      normalized_ingredients: (total ?? 0) - blocked,
      pricing_allowed: blocked === 0,
    };
  });

// ---- Test Harness ---------------------------------------------------------
//
// Deterministic tests using synthetic in-memory inputs. Does NOT touch
// recipe_ingredients. It still creates a real run row (under the
// recipe_weight_normalization_test stage) and writes pricing_v2_errors so the
// errors page and CSV export work.

type TestCase = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  inventory: { each_weight_grams: number | null; pack_weight_grams: number | null } | null;
  rule_kind: "weight" | "volume" | "none";
  expect_ok: boolean;
  expect_grams?: number;
  expect_status: NormStatus;
  expect_error_type?: ErrorType;
};

const TEST_CASES: TestCase[] = [
  // PASS
  { id: "A_oz",     name: "A) 8 oz weight unit → 226.796 g",         quantity: 8, unit: "oz",   inventory: null,                                                  rule_kind: "weight", expect_ok: true,  expect_grams: 8 * 28.349523125, expect_status: "normalized" },
  { id: "B_lb",     name: "B) 2 lb weight unit → 907.184 g",         quantity: 2, unit: "lb",   inventory: null,                                                  rule_kind: "weight", expect_ok: true,  expect_grams: 2 * 453.59237,    expect_status: "normalized" },
  { id: "C_each",   name: "C) 1 each egg (inventory 50g) → 50 g",    quantity: 1, unit: "each", inventory: { each_weight_grams: 50, pack_weight_grams: null },    rule_kind: "none",   expect_ok: true,  expect_grams: 50,               expect_status: "normalized" },
  // FAIL
  { id: "D_volume", name: "D) 1 cup flour (no density)",             quantity: 1, unit: "cup",  inventory: null,                                                  rule_kind: "volume", expect_ok: false, expect_status: "blocked_ambiguous_unit",   expect_error_type: "VOLUME_UNIT_NO_DENSITY" },
  { id: "E_each",   name: "E) 1 each lemon (inventory has no weight)", quantity: 1, unit: "each", inventory: { each_weight_grams: null, pack_weight_grams: null }, rule_kind: "none", expect_ok: false, expect_status: "blocked_ambiguous_unit",   expect_error_type: "EACH_UNIT_NO_WEIGHT" },
  { id: "F_unmapped", name: "F) 1 each onion (no inventory link)",   quantity: 1, unit: "each", inventory: null,                                                  rule_kind: "none",   expect_ok: false, expect_status: "blocked_unmapped_inventory", expect_error_type: "UNMAPPED_INVENTORY" },
];

function ruleFor(kind: TestCase["rule_kind"], unit: string): { grams_per_unit: number | null; requires_density: boolean } | null {
  if (kind === "weight") {
    const u = unit.toLowerCase();
    if (u === "oz") return { grams_per_unit: 28.349523125, requires_density: false };
    if (u === "lb") return { grams_per_unit: 453.59237, requires_density: false };
    if (u === "kg") return { grams_per_unit: 1000, requires_density: false };
    if (u === "g")  return { grams_per_unit: 1, requires_density: false };
  }
  if (kind === "volume") return { grams_per_unit: null, requires_density: true };
  return null;
}

export const runRecipeNormalizeTestHarness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: TEST_STAGE,
        status: "running",
        initiated_by: userId ?? null,
        triggered_by: "test_harness",
        params: { test_harness: true, test_count: TEST_CASES.length },
        notes: "Stage -1 recipe weight normalization test harness",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId: string = runRow.run_id;

    const TOLERANCE = 0.001;
    const results: Array<{
      id: string;
      name: string;
      pass: boolean;
      expect_ok: boolean;
      expect_grams?: number;
      expect_status: NormStatus;
      expect_error_type?: ErrorType;
      actual_grams: number | null;
      actual_status: NormStatus;
      actual_error_type: ErrorType | null;
      detail: string;
    }> = [];
    const errs: ErrorRow[] = [];

    try {
      for (const tc of TEST_CASES) {
        const outcome = convertIngredientToGrams({
          quantity: tc.quantity,
          unit: tc.unit,
          inventory: tc.inventory,
          rule: ruleFor(tc.rule_kind, tc.unit),
        });

        const actualStatus = outcome.status;
        const actualGrams = outcome.ok ? outcome.grams : null;
        const actualType = outcome.ok ? null : outcome.type;

        let pass = outcome.ok === tc.expect_ok && actualStatus === tc.expect_status;
        let detail = "";
        if (pass && tc.expect_ok && tc.expect_grams != null && actualGrams != null) {
          const diff = Math.abs(actualGrams - tc.expect_grams);
          if (diff > TOLERANCE) {
            pass = false;
            detail = `grams off by ${diff.toFixed(4)} (expected ${tc.expect_grams.toFixed(4)}, got ${actualGrams.toFixed(4)})`;
          } else {
            detail = `grams match within ${TOLERANCE}`;
          }
        }
        if (pass && !tc.expect_ok && tc.expect_error_type && actualType !== tc.expect_error_type) {
          pass = false;
          detail = `expected error type ${tc.expect_error_type}, got ${actualType}`;
        }
        if (!detail) detail = pass ? "outcome matches expectation" : `expected ${tc.expect_status}, got ${actualStatus}`;

        // Log uniform error for FAIL cases (always — same as real runner).
        if (!outcome.ok) {
          errs.push({
            run_id: runId,
            stage: TEST_STAGE,
            severity: "error",
            type: outcome.type,
            entity_type: "test_case",
            entity_id: `TEST:${runId}:${tc.id}`,
            entity_name: tc.name,
            message: outcome.reason,
            suggested_fix:
              outcome.type === "VOLUME_UNIT_NO_DENSITY"
                ? "Switch to a weight unit, or enter a manual grams override."
                : outcome.type === "EACH_UNIT_NO_WEIGHT"
                  ? "Set each_weight_grams on the linked inventory item."
                  : outcome.type === "UNMAPPED_INVENTORY"
                    ? "Map this ingredient to an inventory item with each/pack weight."
                    : "Investigate.",
            debug_json: { test_case: tc.id, quantity: tc.quantity, unit: tc.unit, inventory: tc.inventory, rule_kind: tc.rule_kind },
          });
        }
        if (!pass) {
          errs.push({
            run_id: runId,
            stage: TEST_STAGE,
            severity: "error",
            type: "TEST_ASSERTION_FAILED",
            entity_type: "test_case",
            entity_id: `TEST:${runId}:${tc.id}`,
            entity_name: tc.name,
            message: `Test "${tc.name}" failed: ${detail}`,
            suggested_fix: "Investigate normalizer regression or update test expectations.",
            debug_json: {
              test_case: tc.id,
              expect: { ok: tc.expect_ok, status: tc.expect_status, grams: tc.expect_grams, error_type: tc.expect_error_type },
              actual: outcome,
            },
          });
        }

        results.push({
          id: tc.id,
          name: tc.name,
          pass,
          expect_ok: tc.expect_ok,
          expect_grams: tc.expect_grams,
          expect_status: tc.expect_status,
          expect_error_type: tc.expect_error_type,
          actual_grams: actualGrams,
          actual_status: actualStatus,
          actual_error_type: actualType,
          detail,
        });
      }

      if (errs.length) await supabase.from("pricing_v2_errors").insert(errs);

      const passed = results.filter((r) => r.pass).length;
      const failed = results.length - passed;
      const errorsCount = errs.filter((e) => e.severity === "error").length;

      await supabase
        .from("pricing_v2_runs")
        .update({
          status: failed === 0 ? "succeeded" : "failed",
          ended_at: new Date().toISOString(),
          counts_in: results.length,
          counts_out: passed,
          warnings_count: 0,
          errors_count: errorsCount,
          last_error: results.find((r) => !r.pass)?.detail ?? null,
        })
        .eq("run_id", runId);

      return {
        run_id: runId,
        stage: TEST_STAGE,
        total: results.length,
        passed,
        failed,
        warnings_count: 0,
        errors_count: errorsCount,
        results,
      };
    } catch (e: any) {
      await supabase
        .from("pricing_v2_runs")
        .update({ status: "failed", ended_at: new Date().toISOString(), last_error: e?.message ?? String(e) })
        .eq("run_id", runId);
      throw e;
    }
  });

// ---- Unit Conversion Rules CRUD ------------------------------------------

export const listUnitConversionRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_unit_conversion_rules")
      .select("unit, grams_per_unit, requires_density, notes, updated_at")
      .order("unit", { ascending: true });
    if (error) throw new Error(error.message);
    return { rules: data ?? [] };
  });

const upsertRuleSchema = z.object({
  unit: z.string().trim().min(1).max(64).transform((s) => s.toLowerCase()),
  grams_per_unit: z.number().positive().nullable().optional(),
  requires_density: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertUnitConversionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertRuleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    if (!data.requires_density && (data.grams_per_unit == null || data.grams_per_unit <= 0)) {
      throw new Error("grams_per_unit is required (and > 0) when requires_density is false.");
    }
    const payload = {
      unit: data.unit,
      grams_per_unit: data.requires_density ? null : data.grams_per_unit ?? null,
      requires_density: data.requires_density,
      notes: data.notes ?? null,
    };
    const { error } = await supabase
      .from("pricing_v2_unit_conversion_rules")
      .upsert(payload, { onConflict: "unit" });
    if (error) throw new Error(error.message);
    return { ok: true, unit: data.unit };
  });

export const deleteUnitConversionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ unit: z.string().trim().min(1).transform((s) => s.toLowerCase()) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_unit_conversion_rules")
      .delete()
      .eq("unit", data.unit);
    if (error) throw new Error(error.message);
    return { ok: true, unit: data.unit };
  });
