// Pricing v2 — Stage 0: Kroger catalog bootstrap.
//
// Pulls Kroger products for the configured store_id, persists raw payloads,
// upserts a normalized item catalog, and parses net_weight_grams. Failures
// are logged uniformly to pricing_v2_errors.
//
// Source selection:
//   1) every distinct kroger_product_id on inventory_items (active items),
//   2) plus optional keyword search (Run Subset → keyword input).
//
// Stage value reused: "catalog" (no enum migration needed).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProductsByIds, searchProducts, type KrogerProduct } from "@/lib/server/pricing-v2/kroger";
import { parseWeightToGrams } from "@/lib/server/pricing-v2/weight-parser";

const STAGE = "catalog" as const;

// ---- Inputs ---------------------------------------------------------------

const bootstrapSchema = z.object({
  dry_run: z.boolean().default(false),
  limit: z.number().int().min(1).max(2000).optional(),
  keyword: z.string().trim().max(120).optional(),
});

// ---- Helpers --------------------------------------------------------------

function productKey(storeId: string, p: KrogerProduct): string {
  return `${storeId}:${p.productId}:${p.upc ?? "NOUPC"}`;
}

function pickSizeRaw(p: KrogerProduct): string | null {
  const items = p.items ?? [];
  for (const it of items) {
    if (typeof it?.size === "string" && it.size.trim()) return it.size.trim();
  }
  return null;
}

async function getStoreId(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("pricing_v2_settings")
    .select("kroger_store_id")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const id = data?.kroger_store_id;
  if (!id) throw new Error("Pricing v2 Settings: kroger_store_id is not set.");
  return id;
}

async function collectInventoryProductIds(supabase: any, max: number): Promise<string[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("kroger_product_id")
    .not("kroger_product_id", "is", null)
    .limit(max);
  if (error) throw new Error(error.message);
  const ids = (data ?? [])
    .map((r: any) => String(r.kroger_product_id ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

type ErrorRow = {
  run_id: string;
  stage: typeof STAGE;
  severity: "warning" | "error";
  type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  message: string;
  suggested_fix: string | null;
  debug_json: Record<string, any>;
};

// ---- runCatalogBootstrap --------------------------------------------------

export const runCatalogBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bootstrapSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const storeId = await getStoreId(supabase);

    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: STAGE,
        status: "running",
        initiated_by: userId ?? null,
        triggered_by: "ui",
        params: { dry_run: data.dry_run, limit: data.limit ?? null, keyword: data.keyword ?? null, store_id: storeId },
        notes: data.dry_run ? "dry_run=true (catalog_bootstrap)" : "catalog_bootstrap",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId: string = runRow.run_id;

    const errors: ErrorRow[] = [];
    let countsIn = 0;
    let countsOut = 0;
    let warnings = 0;
    let errCount = 0;

    try {
      // 1) Build target product list.
      const cap = data.limit ?? (data.dry_run ? 50 : 1000);
      const fromInventory = await collectInventoryProductIds(supabase, cap);
      let products: KrogerProduct[] = [];

      if (fromInventory.length) {
        const slice = fromInventory.slice(0, cap);
        products = await fetchProductsByIds({ storeId, productIds: slice });
      }
      if (data.keyword && products.length < cap) {
        const more = await searchProducts({
          storeId,
          term: data.keyword,
          limit: cap - products.length,
        });
        // de-dupe by productKey
        const seen = new Set(products.map((p) => productKey(storeId, p)));
        for (const p of more) {
          const k = productKey(storeId, p);
          if (!seen.has(k)) {
            products.push(p);
            seen.add(k);
          }
        }
      }
      countsIn = products.length;

      if (!products.length) {
        warnings += 1;
        errors.push({
          run_id: runId,
          stage: STAGE,
          severity: "warning",
          type: "NO_PRODUCTS",
          entity_type: "run",
          entity_id: null,
          entity_name: null,
          message: "No products fetched from Kroger (no inventory mappings and no keyword).",
          suggested_fix: "Set kroger_product_id on inventory items, or pass a keyword via Run Subset.",
          debug_json: { store_id: storeId, inventory_ids: fromInventory.length },
        });
      }

      // 2) Per-product: persist raw + upsert catalog + parse weight.
      const seenKeys = new Set<string>();
      for (const p of products) {
        const key = productKey(storeId, p);
        const sizeRaw = pickSizeRaw(p);

        // Raw row (skip in dry run).
        if (!data.dry_run) {
          await supabase.from("pricing_v2_kroger_catalog_raw").insert({
            run_id: runId,
            store_id: storeId,
            kroger_product_id: p.productId,
            upc: p.upc ?? null,
            name: p.description ?? "(unnamed)",
            brand: p.brand ?? null,
            size_raw: sizeRaw,
            payload_json: p.raw,
          });
        }

        // Duplicate-key warning.
        if (seenKeys.has(key)) {
          warnings += 1;
          errors.push({
            run_id: runId,
            stage: STAGE,
            severity: "warning",
            type: "DUPLICATE_KEY",
            entity_type: "product",
            entity_id: key,
            entity_name: p.description ?? null,
            message: `Duplicate product_key encountered in this run: ${key}`,
            suggested_fix: "Investigate Kroger duplicate listings; only one row will be upserted.",
            debug_json: { product_key: key },
          });
          continue;
        }
        seenKeys.add(key);

        // Parse weight.
        const parsed = parseWeightToGrams({ size_raw: sizeRaw, payload_json: p.raw });
        let netGrams: number | null = null;
        let weightSource = "unknown";

        if (parsed.ok) {
          netGrams = parsed.net_weight_grams;
          weightSource = "parsed";
        } else {
          // Block / log error.
          const isBlocker =
            parsed.failure === "MISSING_SIZE" ||
            parsed.failure === "WEIGHT_PARSE_FAIL" ||
            parsed.failure === "VOLUME_ONLY" ||
            parsed.failure === "ZERO_OR_NEG_WEIGHT";
          const sev: "warning" | "error" = isBlocker ? "error" : "warning";
          if (sev === "error") errCount += 1;
          else warnings += 1;
          errors.push({
            run_id: runId,
            stage: STAGE,
            severity: sev,
            type: parsed.failure,
            entity_type: "product",
            entity_id: key,
            entity_name: p.description ?? null,
            message: parsed.reason,
            suggested_fix:
              parsed.failure === "VOLUME_ONLY"
                ? "Exclude this item — pipeline is weight-only."
                : "Use Fix Weight to set manual_net_weight_grams with a reason.",
            debug_json: { size_raw: sizeRaw, trace: parsed.trace },
          });
        }

        if (!data.dry_run) {
          // Preserve manual override if it exists.
          const { data: existing } = await supabase
            .from("pricing_v2_item_catalog")
            .select("manual_net_weight_grams, manual_override_reason, weight_source")
            .eq("product_key", key)
            .maybeSingle();

          const manualGrams = existing?.manual_net_weight_grams ?? null;
          const finalGrams = manualGrams ?? netGrams;
          const finalSource = manualGrams != null ? "manual_override" : weightSource;

          const upErr = await supabase
            .from("pricing_v2_item_catalog")
            .upsert(
              {
                store_id: storeId,
                product_key: key,
                kroger_product_id: p.productId,
                upc: p.upc ?? null,
                name: p.description ?? "(unnamed)",
                brand: p.brand ?? null,
                size_raw: sizeRaw,
                net_weight_grams: finalGrams,
                weight_source: finalSource,
                manual_net_weight_grams: manualGrams,
                manual_override_reason: existing?.manual_override_reason ?? null,
                last_run_id: runId,
              },
              { onConflict: "product_key" }
            );
          if (upErr.error) {
            errCount += 1;
            errors.push({
              run_id: runId,
              stage: STAGE,
              severity: "error",
              type: "UPSERT_FAILED",
              entity_type: "product",
              entity_id: key,
              entity_name: p.description ?? null,
              message: upErr.error.message,
              suggested_fix: "Investigate database upsert error.",
              debug_json: {},
            });
          } else {
            countsOut += 1;
          }
        }
      }

      // 3) Persist errors (chunked).
      if (errors.length) {
        for (let i = 0; i < errors.length; i += 500) {
          const chunk = errors.slice(i, i + 500);
          await supabase.from("pricing_v2_errors").insert(chunk);
        }
      }

      // 4) Finalize run row.
      await supabase
        .from("pricing_v2_runs")
        .update({
          status: errCount > 0 ? "failed" : "succeeded",
          ended_at: new Date().toISOString(),
          counts_in: countsIn,
          counts_out: countsOut,
          warnings_count: warnings,
          errors_count: errCount,
          last_error: errors.find((e) => e.severity === "error")?.message ?? null,
        })
        .eq("run_id", runId);

      return {
        run_id: runId,
        dry_run: data.dry_run,
        store_id: storeId,
        counts_in: countsIn,
        counts_out: countsOut,
        warnings_count: warnings,
        errors_count: errCount,
        errors_preview: errors.slice(0, 50),
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
          warnings_count: warnings,
          errors_count: errCount + 1,
        })
        .eq("run_id", runId);
      throw e;
    }
  });

// ---- Listing helpers ------------------------------------------------------

export const listCatalogRunErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        run_id: z.string().uuid().optional(),
        severity: z.enum(["warning", "error"]).optional(),
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
      .eq("stage", STAGE)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.run_id) q = q.eq("run_id", data.run_id);
    if (data.severity) q = q.eq("severity", data.severity);
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { errors: rows ?? [] };
  });

export const listCatalogRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_runs")
      .select("run_id, status, started_at, ended_at, counts_in, counts_out, warnings_count, errors_count, params, notes, last_error")
      .eq("stage", STAGE)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });

// ---- Manual weight override ----------------------------------------------

export const setManualWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        product_key: z.string().min(1).max(200),
        grams: z.number().positive().max(1_000_000),
        reason: z.string().min(1).max(500),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_item_catalog")
      .update({
        manual_net_weight_grams: data.grams,
        manual_override_reason: data.reason,
        net_weight_grams: data.grams,
        weight_source: "manual_override",
      })
      .eq("product_key", data.product_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Re-parse a single item (uses latest stored payload) ------------------

export const reparseCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ product_key: z.string().min(1).max(200) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: item, error: e1 } = await supabase
      .from("pricing_v2_item_catalog")
      .select("product_key, store_id, kroger_product_id, size_raw, manual_net_weight_grams, manual_override_reason")
      .eq("product_key", data.product_key)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!item) throw new Error("Item not found");

    if (item.manual_net_weight_grams) {
      return { ok: true, net_weight_grams: Number(item.manual_net_weight_grams), source: "manual_override" };
    }

    const { data: raw } = await supabase
      .from("pricing_v2_kroger_catalog_raw")
      .select("size_raw, payload_json, fetched_at")
      .eq("store_id", item.store_id)
      .eq("kroger_product_id", item.kroger_product_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const parsed = parseWeightToGrams({
      size_raw: raw?.size_raw ?? item.size_raw,
      payload_json: raw?.payload_json ?? null,
    });
    if (!parsed.ok) {
      return { ok: false, failure: parsed.failure, reason: parsed.reason };
    }
    await supabase
      .from("pricing_v2_item_catalog")
      .update({ net_weight_grams: parsed.net_weight_grams, weight_source: "parsed" })
      .eq("product_key", data.product_key);
    return { ok: true, net_weight_grams: parsed.net_weight_grams, source: "parsed" };
  });

// ---- Trace ----------------------------------------------------------------

export const traceCatalogProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ product_key: z.string().min(1).max(200) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: item } = await supabase
      .from("pricing_v2_item_catalog")
      .select("*")
      .eq("product_key", data.product_key)
      .maybeSingle();
    const { data: raws } = await supabase
      .from("pricing_v2_kroger_catalog_raw")
      .select("run_id, size_raw, payload_json, fetched_at")
      .eq("product_key" as any, data.product_key) // ignored; below is correct
      .limit(0); // placeholder to keep TS happy
    // proper raw fetch:
    const { data: rawRows } = item
      ? await supabase
          .from("pricing_v2_kroger_catalog_raw")
          .select("run_id, size_raw, payload_json, fetched_at")
          .eq("store_id", item.store_id)
          .eq("kroger_product_id", item.kroger_product_id)
          .order("fetched_at", { ascending: false })
          .limit(5)
      : { data: [] as any[] };
    const latestRaw = (rawRows ?? [])[0];
    const parse = item
      ? parseWeightToGrams({ size_raw: latestRaw?.size_raw ?? item.size_raw, payload_json: latestRaw?.payload_json ?? null })
      : null;
    void raws;
    return { item, raws: rawRows ?? [], parse };
  });

// ---- Test harness (kept from previous Stage 0; updated payload) -----------

export const runCatalogTestHarness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: STAGE,
        status: "running",
        initiated_by: userId ?? null,
        triggered_by: "test_harness",
        params: { test_harness: true },
        notes: "Stage 0 catalog test harness (parser + uniform errors)",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId: string = runRow.run_id;

    type TC = { name: string; size_raw: string; expect_ok: boolean; expect_grams?: number };
    const tcs: TC[] = [
      { name: "PASS simple oz",     size_raw: "16 oz",         expect_ok: true, expect_grams: 16 * 28.349523125 },
      { name: "PASS lb",            size_raw: "1 lb",          expect_ok: true, expect_grams: 453.59237 },
      { name: "PASS multi pack",    size_raw: "6 x 8 oz",      expect_ok: true, expect_grams: 6 * 8 * 28.349523125 },
      { name: "FAIL volume only",   size_raw: "1 gallon",      expect_ok: false },
      { name: "FAIL each only",     size_raw: "each",          expect_ok: false },
      { name: "FAIL varies",        size_raw: "random weight", expect_ok: false },
    ];

    const results: Array<{ name: string; pass: boolean; got: any; expect_ok: boolean }> = [];
    const errs: ErrorRow[] = [];
    for (const tc of tcs) {
      const r = parseWeightToGrams({ size_raw: tc.size_raw });
      const pass = r.ok === tc.expect_ok && (!tc.expect_grams || (r.ok && Math.abs(r.net_weight_grams - tc.expect_grams) < 0.001));
      results.push({ name: tc.name, pass, got: r, expect_ok: tc.expect_ok });
      if (!r.ok) {
        errs.push({
          run_id: runId,
          stage: STAGE,
          severity: pass ? "warning" : "error",
          type: r.failure,
          entity_type: "test_case",
          entity_id: null,
          entity_name: tc.name,
          message: r.reason,
          suggested_fix: pass ? "Expected failure (test case)." : "Investigate parser regression.",
          debug_json: { size_raw: tc.size_raw, trace: r.trace },
        });
      }
    }
    if (errs.length) await supabase.from("pricing_v2_errors").insert(errs);

    const passed = results.filter((r) => r.pass).length;
    await supabase
      .from("pricing_v2_runs")
      .update({
        status: passed === results.length ? "succeeded" : "failed",
        ended_at: new Date().toISOString(),
        counts_in: results.length,
        counts_out: passed,
        warnings_count: errs.filter((e) => e.severity === "warning").length,
        errors_count: errs.filter((e) => e.severity === "error").length,
      })
      .eq("run_id", runId);

    return { run_id: runId, results, passed, total: results.length };
  });
