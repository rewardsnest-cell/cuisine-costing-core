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
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProductsByIds, searchProducts, type KrogerProduct } from "@/lib/server/pricing-v2/kroger";
import { parseWeightToGrams } from "@/lib/server/pricing-v2/weight-parser";
import { normalizeWeightInput, compareWithSizeRaw } from "@/lib/server/pricing-v2/normalize-weight-input";
import {
  dispatchStuckRecoveryAlerts,
  loadAlertConfig,
  type RecoveredRunBreach,
} from "@/lib/server/pricing-v2/alerts";

const STAGE = "catalog" as const;

// ---- Inputs ---------------------------------------------------------------

const bootstrapSchema = z.object({
  dry_run: z.boolean().default(false),
  // Per-call batch size (a single page of inventory IDs to fetch this invocation).
  // Bootstrap loops across multiple invocations until all inventory IDs are processed.
  batch_size: z.number().int().min(1).max(10000).optional(),
  keyword: z.string().trim().max(120).optional(),
  // Skip the mapped-inventory preflight gate. Defaults to false; a dry-run
  // ignores the gate automatically so admins can preview without mapping.
  bypass_min_mapped_check: z.boolean().default(false),
  // When true, bootstrap stores raw size only and skips parseWeightToGrams.
  // net_weight_grams is left null and weight_source = 'unparsed'. Defaults
  // to true in staging so download isn't blocked by parser failures.
  skip_weight_normalization: z.boolean().default(true),
});

// ---- Mapped-inventory preflight ------------------------------------------

const DEFAULT_MIN_MAPPED = 10;

async function getMinMappedThreshold(supabase: any): Promise<number> {
  const { data } = await supabase
    .from("pricing_v2_settings")
    .select("min_mapped_inventory_for_bootstrap")
    .eq("id", 1)
    .maybeSingle();
  const v = Number(data?.min_mapped_inventory_for_bootstrap);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_MAPPED;
}

async function countMappedInventoryIds(supabase: any): Promise<number> {
  const ids = await listAllInventoryProductIds(supabase);
  return ids.length;
}

export type BootstrapPreflight = {
  ok: boolean;
  mapped_count: number;
  threshold: number;
  store_id: string;
  reason: string | null;
  guidance: string[];
};

async function evaluatePreflight(supabase: any): Promise<BootstrapPreflight> {
  // Mapped-inventory gate has been removed — bootstrap ingests the entire
  // available catalog regardless of how many inventory items are mapped.
  // We still report the mapped count for visibility, but it never blocks.
  const storeId = await getStoreId(supabase);
  const [mapped, threshold] = await Promise.all([
    countMappedInventoryIds(supabase),
    getMinMappedThreshold(supabase),
  ]);
  return { ok: true, mapped_count: mapped, threshold, store_id: storeId, reason: null, guidance: [] };
}

export const getBootstrapPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    return evaluatePreflight(supabase);
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

/**
 * Returns ALL distinct kroger_product_ids on inventory, sorted, for stable
 * cursoring. Resume position is the last successfully-fetched ID
 * (last_page_token); the next batch starts strictly after it.
 */
async function listAllInventoryProductIds(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("kroger_product_id")
    .not("kroger_product_id", "is", null)
    .order("kroger_product_id", { ascending: true });
  if (error) throw new Error(error.message);
  const ids = (data ?? [])
    .map((r: any) => String(r.kroger_product_id ?? "").trim())
    .filter(Boolean);
  // dedupe but keep sort order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

async function getOrCreateBootstrapState(supabase: any, storeId: string) {
  const { data } = await supabase
    .from("pricing_v2_catalog_bootstrap_state")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabase
    .from("pricing_v2_catalog_bootstrap_state")
    .insert({ store_id: storeId, status: "NOT_STARTED", total_items_fetched: 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

type ErrorRow = {
  run_id: string;
  stage: "catalog" | "catalog_bootstrap_test";
  severity: "warning" | "error" | "critical";
  type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  message: string;
  suggested_fix: string | null;
  debug_json: Record<string, any>;
};

// ---- runCatalogBootstrap --------------------------------------------------

type BootstrapInput = z.infer<typeof bootstrapSchema>;
type ExecOpts = { triggered_by?: string; replay_of?: string | null };

async function executeCatalogBootstrap(
  supabase: any,
  userId: string | null,
  data: BootstrapInput,
  opts: ExecOpts = {},
) {
    const storeId = await getStoreId(supabase);

    // ---- Pre-check: bootstrap_state guard --------------------------------
    // Bootstrap stops permanently once COMPLETED. Re-running is a no-op
    // until the admin explicitly Resets the catalog.
    const state = await getOrCreateBootstrapState(supabase, storeId);
    if (state.status === "COMPLETED") {
      return {
        run_id: null as string | null,
        skipped: true,
        message: "Catalog bootstrap already completed",
        store_id: storeId,
        bootstrap_state: state,
        counts_in: 0,
        counts_out: 0,
        warnings_count: 0,
        errors_count: 0,
        page_done: true,
        bootstrap_completed: true,
        errors_preview: [] as ErrorRow[],
      };
    }

    // ---- Pre-check: mapped-inventory minimum gate ------------------------
    // Block the full bootstrap when too few inventory items are mapped to a
    // Kroger product. Dry-runs and explicit bypass skip the gate.
    if (!data.dry_run && !data.bypass_min_mapped_check) {
      const pf = await evaluatePreflight(supabase);
      if (!pf.ok) {
        return {
          run_id: null as string | null,
          skipped: true,
          blocked_by_preflight: true,
          preflight: pf,
          message: pf.reason ?? "Bootstrap blocked by preflight",
          store_id: storeId,
          bootstrap_state: state,
          counts_in: 0,
          counts_out: 0,
          warnings_count: 0,
          errors_count: 0,
          page_done: false,
          bootstrap_completed: false,
          errors_preview: [] as ErrorRow[],
        };
      }
    }

    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: STAGE,
        status: "running",
        initiated_by: userId ?? null,
        triggered_by: opts.triggered_by ?? "ui",
        params: {
          dry_run: data.dry_run,
          batch_size: data.batch_size ?? null,
          keyword: data.keyword ?? null,
          store_id: storeId,
          resumed_from: state.last_page_token ?? null,
          replay_of: opts.replay_of ?? null,
          skip_weight_normalization: data.skip_weight_normalization,
        },
        notes: opts.replay_of
          ? `replay of ${opts.replay_of}${data.dry_run ? " (dry_run)" : ""}`
          : data.dry_run
            ? "dry_run=true (catalog_bootstrap)"
            : "catalog_bootstrap",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId: string = runRow.run_id;

    // Mark IN_PROGRESS (idempotent) — only on a real (non-dry) run.
    if (!data.dry_run) {
      const patch: Record<string, any> = { status: "IN_PROGRESS", last_run_id: runId };
      if (state.status === "NOT_STARTED" || !state.started_at) {
        patch.started_at = new Date().toISOString();
      }
      await supabase
        .from("pricing_v2_catalog_bootstrap_state")
        .update(patch)
        .eq("store_id", storeId);
    }

    const errors: ErrorRow[] = [];
    let countsIn = 0;
    let countsOut = 0;
    let warnings = 0;
    let errCount = 0;
    let pageDone = false;
    let nextCursor: string | null = state.last_page_token ?? null;

    try {
      // 1) Resumable inventory cursor: fetch ALL inventory ids, slice strictly
      //    after the resume cursor, take batch_size for this invocation.
      const batchSize = data.batch_size ?? (data.dry_run ? 50 : 200);
      const allIds = await listAllInventoryProductIds(supabase);
      const startIdx = nextCursor ? allIds.findIndex((id) => id > nextCursor!) : 0;
      const sliceStart = startIdx === -1 ? allIds.length : Math.max(0, startIdx);
      const slice = allIds.slice(sliceStart, sliceStart + batchSize);
      const remainingAfter = Math.max(0, allIds.length - (sliceStart + slice.length));

      let products: KrogerProduct[] = [];
      if (slice.length) {
        products = await fetchProductsByIds({ storeId, productIds: slice });
      }

      // Keyword sweep is supplemental and only runs on the FIRST invocation.
      if (data.keyword && !nextCursor) {
        const more = await searchProducts({ storeId, term: data.keyword, limit: 250 });
        const seenK = new Set(products.map((p) => productKey(storeId, p)));
        for (const p of more) {
          const k = productKey(storeId, p);
          if (!seenK.has(k)) { products.push(p); seenK.add(k); }
        }
      }

      countsIn = products.length;
      pageDone = remainingAfter === 0;

      if (!slice.length && !products.length) {
        warnings += 1;
        errors.push({
          run_id: runId,
          stage: STAGE,
          severity: "warning",
          type: "NO_PRODUCTS",
          entity_type: "run",
          entity_id: null,
          entity_name: null,
          message: "No inventory items have a kroger_product_id mapped — nothing to bootstrap.",
          suggested_fix: "Map inventory items to Kroger products, then re-run bootstrap.",
          debug_json: { store_id: storeId, inventory_ids_total: allIds.length },
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

        // Weight handling. When skip_weight_normalization is true, bootstrap
        // stores raw size only — net_weight_grams is left null and no parse
        // errors are logged. Normalization happens later via reparse / Fix Weight.
        let netGrams: number | null = null;
        let weightSource = "unparsed";

        if (!data.skip_weight_normalization) {
          const parsed = parseWeightToGrams({ size_raw: sizeRaw, payload_json: p.raw });
          if (parsed.ok) {
            netGrams = parsed.net_weight_grams;
            weightSource = "parsed";
          } else {
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
            weightSource = "unknown";
          }
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

      // 4) Advance bootstrap_state cursor + counters; finalize when done.
      let bootstrapCompleted = false;
      if (!data.dry_run) {
        // Cursor advances even if some products weren't returned by Kroger,
        // so unmapped/invalid IDs don't permanently block progress.
        const advancedCursor = slice.length ? slice[slice.length - 1] : nextCursor;

        const statePatch: Record<string, any> = {
          last_run_id: runId,
          last_page_token: advancedCursor,
          total_items_fetched: (state.total_items_fetched ?? 0) + countsOut,
        };

        if (pageDone) {
          bootstrapCompleted = true;
          statePatch.status = "COMPLETED";
          statePatch.completed_at = new Date().toISOString();
          statePatch.last_page_token = null;
        } else {
          statePatch.status = "IN_PROGRESS";
        }

        await supabase
          .from("pricing_v2_catalog_bootstrap_state")
          .update(statePatch)
          .eq("store_id", storeId);
      }

      // 5) Finalize run row.
      const runNotes = bootstrapCompleted
        ? `catalog_bootstrap completed — total_items_fetched=${(state.total_items_fetched ?? 0) + countsOut}`
        : `catalog_bootstrap batch — fetched=${countsOut} of batch_size=${batchSize}`;

      await supabase
        .from("pricing_v2_runs")
        .update({
          status: errCount > 0 ? "failed" : "success",
          ended_at: new Date().toISOString(),
          counts_in: countsIn,
          counts_out: countsOut,
          warnings_count: warnings,
          errors_count: errCount,
          last_error: errors.find((e) => e.severity === "error")?.message ?? null,
          notes: runNotes,
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
        page_done: pageDone,
        bootstrap_completed: bootstrapCompleted,
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
}

export const runCatalogBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bootstrapSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    return executeCatalogBootstrap(supabase, userId ?? null, data, { triggered_by: "ui" });
  });

// ---- replayCatalogRun -----------------------------------------------------
//
// Re-run a previously failed (or auto-recovered) bootstrap attempt using the
// EXACT params saved on the original run. Appends a new audit-trail entry
// (a fresh pricing_v2_runs row) tagged with triggered_by='replay' and
// params.replay_of = <original run_id>.
export const replayCatalogRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      run_id: z.string().uuid(),
      // When true, reset the bootstrap cursor (last_page_token) before
      // replaying so the run reprocesses every product ID from the start —
      // including ones the original successfully fetched. Useful when
      // debugging because the original run's "successful stages" are
      // re-executed end-to-end instead of resuming from the failure point.
      include_successful: z.boolean().default(false),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: orig, error: origErr } = await supabase
      .from("pricing_v2_runs")
      .select("run_id, stage, status, params")
      .eq("run_id", data.run_id)
      .maybeSingle();
    if (origErr) throw new Error(origErr.message);
    if (!orig) throw new Error(`Run ${data.run_id} not found`);
    if (orig.stage !== "catalog" && orig.stage !== "catalog_bootstrap_test") {
      throw new Error(`Run ${data.run_id} is not a catalog bootstrap run (stage=${orig.stage})`);
    }
    if (orig.status !== "failed" && orig.status !== "running") {
      throw new Error(
        `Replay is only supported for failed or stuck-running runs (this run is '${orig.status}'). ` +
          `Use Recover Stuck Runs first if needed.`,
      );
    }

    const p = (orig.params ?? {}) as Record<string, any>;
    const replayInput: BootstrapInput = bootstrapSchema.parse({
      dry_run: Boolean(p.dry_run ?? false),
      batch_size: typeof p.batch_size === "number" ? p.batch_size : undefined,
      keyword: typeof p.keyword === "string" && p.keyword ? p.keyword : undefined,
      // Bypass the preflight gate on replay — operator already triggered the
      // original attempt; failing the gate now would mask the real failure.
      bypass_min_mapped_check: true,
      // Preserve the original run's weight-normalization choice so replays
      // are bit-for-bit reproducible.
      skip_weight_normalization: typeof p.skip_weight_normalization === "boolean" ? p.skip_weight_normalization : true,
    });

    // Optionally rewind the cursor so successful stages are re-executed.
    let priorCursor: string | null | undefined;
    if (data.include_successful && !replayInput.dry_run) {
      const storeId = await getStoreId(supabase);
      const { data: stateRow } = await supabase
        .from("pricing_v2_catalog_bootstrap_state")
        .select("last_page_token, status")
        .eq("store_id", storeId)
        .maybeSingle();
      priorCursor = stateRow?.last_page_token ?? null;
      await supabase
        .from("pricing_v2_catalog_bootstrap_state")
        .update({
          last_page_token: null,
          // Force IN_PROGRESS so a previously COMPLETED bootstrap doesn't
          // short-circuit on the "already completed" guard.
          status: stateRow?.status === "COMPLETED" ? "IN_PROGRESS" : stateRow?.status ?? "NOT_STARTED",
        })
        .eq("store_id", storeId);
    }

    const result = await executeCatalogBootstrap(supabase, userId ?? null, replayInput, {
      triggered_by: data.include_successful ? "replay_full" : "replay",
      replay_of: orig.run_id,
    });

    return {
      ...result,
      replay_of: orig.run_id,
      original_params: p,
      include_successful: data.include_successful,
      prior_cursor: priorCursor ?? null,
    };
  });

// ---- Bootstrap state (status panel + reset) -------------------------------

export const getCatalogBootstrapState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const storeId = await getStoreId(supabase);
    const state = await getOrCreateBootstrapState(supabase, storeId);
    const allIds = await listAllInventoryProductIds(supabase);
    let processed = 0;
    if (state.last_page_token) {
      const idx = allIds.findIndex((id) => id > state.last_page_token);
      processed = idx === -1 ? allIds.length : idx;
    } else if (state.status === "COMPLETED") {
      processed = allIds.length;
    }
    return {
      state,
      inventory_ids_total: allIds.length,
      inventory_ids_processed: processed,
      inventory_ids_remaining: Math.max(0, allIds.length - processed),
    };
  });

/**
 * Hard-reset Stage 0 bootstrap state. Does NOT delete catalog or raw rows —
 * only flips status back to NOT_STARTED so the loop will restart from the
 * first inventory id.
 */
export const resetCatalogBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ confirmation: z.literal("RESET CATALOG") }).parse(input)
  )
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const storeId = await getStoreId(supabase);
    const { error } = await supabase
      .from("pricing_v2_catalog_bootstrap_state")
      .update({
        status: "NOT_STARTED",
        last_page_token: null,
        total_items_fetched: 0,
        started_at: null,
        completed_at: null,
        last_run_id: null,
      })
      .eq("store_id", storeId);
    if (error) throw new Error(error.message);
    return { ok: true, store_id: storeId };
  });

/**
 * Auto-recover bootstrap runs stuck in `running` for longer than `older_than_minutes`
 * (default 15). Marks them `failed` with a timestamp + error summary, logs an
 * uniform `pricing_v2_errors` row, and flips bootstrap_state back to NOT_STARTED
 * if its last_run_id matches a recovered run, so the loop can be resumed.
 */
export const recoverStuckCatalogRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        older_than_minutes: z.number().int().min(1).max(720).default(15),
      })
      .parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const cutoffIso = new Date(Date.now() - data.older_than_minutes * 60_000).toISOString();
    const nowIso = new Date().toISOString();

    // Capture the literal SQL each recovery step issues (PostgREST equivalents),
    // so the audit row records exactly what was executed.
    const selectStuckSql =
      `SELECT run_id, started_at, stage, counts_in, counts_out, warnings_count, errors_count, params, notes\n` +
      `FROM public.pricing_v2_runs\n` +
      `WHERE stage IN ('catalog','catalog_bootstrap_test')\n` +
      `  AND status = 'running'\n` +
      `  AND started_at < '${cutoffIso}';`;

    const { data: stuck, error: selErr } = await supabase
      .from("pricing_v2_runs")
      .select("run_id, started_at, stage, counts_in, counts_out, warnings_count, errors_count, params, notes")
      .in("stage", ["catalog", "catalog_bootstrap_test"])
      .eq("status", "running")
      .lt("started_at", cutoffIso);
    if (selErr) throw new Error(selErr.message);

    const stuckRuns = stuck ?? [];
    if (stuckRuns.length === 0) {
      return { ok: true, recovered: 0, run_ids: [] as string[], cutoff: cutoffIso };
    }

    const runIds = stuckRuns.map((r: any) => r.run_id as string);
    const summary =
      `Auto-recovered: run was stuck in 'running' for >${data.older_than_minutes}m ` +
      `(no completion signal). Marked failed at ${nowIso}.`;

    const updateRunsSql =
      `UPDATE public.pricing_v2_runs\n` +
      `SET status = 'failed', ended_at = '${nowIso}', last_error = '${summary.replace(/'/g, "''")}'\n` +
      `WHERE run_id IN (${runIds.map((id: string) => `'${id}'`).join(", ")});`;

    const { error: updErr } = await supabase
      .from("pricing_v2_runs")
      .update({ status: "failed", ended_at: nowIso, last_error: summary })
      .in("run_id", runIds);
    if (updErr) throw new Error(updErr.message);

    // One uniform error row per recovered run. Counts are persisted into the
    // structured columns (counts_in/out, warnings/errors_count); the literal
    // SQL text issued by recovery is stored in `executed_sql` and mirrored
    // into debug_json for full auditability.
    const errorRows = stuckRuns.map((r: any) => {
      const startedAt = r.started_at as string | null;
      const stuckMs = startedAt ? Date.now() - new Date(startedAt).getTime() : null;
      const counts = {
        counts_in: r.counts_in ?? 0,
        counts_out: r.counts_out ?? 0,
        warnings_count: r.warnings_count ?? 0,
        errors_count: r.errors_count ?? 0,
      };
      const perRunMessage =
        `Auto-recovered ${r.stage} run ${r.run_id} stuck since ${startedAt ?? "unknown"} ` +
        `(>${data.older_than_minutes}m). Counts at recovery — in:${counts.counts_in} ` +
        `out:${counts.counts_out} warn:${counts.warnings_count} err:${counts.errors_count}.`;
      const executedSql = `-- 1) Identify stuck runs\n${selectStuckSql}\n\n-- 2) Mark this run failed\n${updateRunsSql}`;
      return {
        stage: r.stage,
        run_id: r.run_id,
        severity: "error",
        type: "stuck_run_recovered",
        message: perRunMessage,
        // Structured columns (audit-friendly, queryable):
        counts_in: counts.counts_in,
        counts_out: counts.counts_out,
        warnings_count: counts.warnings_count,
        errors_count: counts.errors_count,
        executed_sql: executedSql,
        debug_json: {
          older_than_minutes: data.older_than_minutes,
          recovered_at: nowIso,
          cutoff: cutoffIso,
          run: {
            run_id: r.run_id,
            stage: r.stage,
            started_at: startedAt,
            stuck_for_ms: stuckMs,
            stuck_for_minutes: stuckMs != null ? Math.round(stuckMs / 60_000) : null,
            params: r.params ?? null,
            notes: r.notes ?? null,
          },
          counts,
          executed_sql_steps: [
            { step: "identify_stuck", sql: selectStuckSql },
            { step: "mark_failed", sql: updateRunsSql },
          ],
        },
      };
    });
    await supabase.from("pricing_v2_errors").insert(errorRows);

    const { data: bsRows } = await supabase
      .from("pricing_v2_catalog_bootstrap_state")
      .select("store_id, last_run_id, status")
      .in("last_run_id", runIds);
    if (bsRows && bsRows.length > 0) {
      const storeIds = bsRows.map((b: any) => b.store_id);
      await supabase
        .from("pricing_v2_catalog_bootstrap_state")
        .update({ status: "NOT_STARTED" })
        .in("store_id", storeIds)
        .eq("status", "IN_PROGRESS");
    }

    // Fire alerts (banner + optional email + optional webhook) for any run
    // whose stuck_for_minutes meets the configured threshold.
    const breaches: RecoveredRunBreach[] = stuckRuns.map((r: any) => {
      const startedAt = r.started_at as string | null;
      const stuckMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
      const stuckMin = Math.round(stuckMs / 60_000);
      return {
        run_id: r.run_id,
        stage: r.stage,
        stuck_for_minutes: stuckMin,
        started_at: startedAt,
        counts_in: r.counts_in ?? 0,
        counts_out: r.counts_out ?? 0,
        warnings_count: r.warnings_count ?? 0,
        errors_count: r.errors_count ?? 0,
        message:
          `Auto-recovered ${r.stage} run ${r.run_id} stuck for ~${stuckMin}m ` +
          `(threshold breach). Marked failed at ${nowIso}.`,
      };
    });
    let alertResult = { fired: 0, events: [] as any[] };
    try {
      const req = getRequest();
      const baseUrl = new URL(req.url).origin;
      alertResult = await dispatchStuckRecoveryAlerts(supabase, breaches, baseUrl);
    } catch (e) {
      // Never let alert dispatch break recovery itself.
      console.error("[stuck-recovery-alerts] dispatch failed:", e);
    }

    return {
      ok: true,
      recovered: runIds.length,
      run_ids: runIds,
      cutoff: cutoffIso,
      alerts_fired: alertResult.fired,
      alert_events: alertResult.events,
    };
  });

/**
 * Detailed diagnostics for a single run — used by the Bootstrap Run Details
 * view. Surfaces the exact Supabase update error + enum/constraint hints so
 * mismatches like writing 'succeeded' vs the enum's 'success' are obvious.
 */
export const getCatalogRunDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ run_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    const { data: run, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .select(
        "run_id, stage, status, started_at, ended_at, counts_in, counts_out, warnings_count, errors_count, params, notes, last_error, triggered_by"
      )
      .eq("run_id", data.run_id)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) throw new Error(`Run ${data.run_id} not found`);

    const { data: errors } = await supabase
      .from("pricing_v2_errors")
      .select("id, severity, type, message, suggested_fix, debug_json, entity_type, entity_id, entity_name, created_at")
      .eq("run_id", data.run_id)
      .order("created_at", { ascending: false })
      .limit(500);

    // Allowed enum values — kept in sync with migrations and surfaced to the
    // UI so writes like 'succeeded' vs 'success' are immediately diagnosable.
    const allowedRunStatus = ["queued", "running", "success", "partial", "failed", "skipped"] as const;
    const allowedSeverity = ["warning", "error", "critical"] as const;

    // Heuristic diagnosis of the failure mode.
    const lastError = (run.last_error ?? "").toString();
    const errorList = errors ?? [];
    const hasStuckRecovery = errorList.some((e: any) => e.type === "stuck_run_recovered");
    const finalizationLikelyFailed =
      run.status === "running" ||
      (run.status === "failed" && /enum|invalid input value|violates|constraint|status|succeeded/i.test(lastError));

    const diagnosis: {
      kind:
        | "ok"
        | "stuck_no_finalize"
        | "enum_mismatch"
        | "constraint_violation"
        | "auto_recovered"
        | "unknown_failure";
      title: string;
      details: string;
      suggested_fix?: string;
      offending_value?: string;
      allowed_values?: readonly string[];
    } = { kind: "ok", title: "Run finalized normally", details: "No finalization issues detected." };

    if (hasStuckRecovery) {
      diagnosis.kind = "auto_recovered";
      diagnosis.title = "Run was auto-recovered after being stuck";
      diagnosis.details = lastError || "Run was marked failed by the stuck-run recovery sweep.";
      diagnosis.suggested_fix =
        "Re-run the bootstrap. If it stalls again, check Kroger API logs and server function timeouts.";
    } else if (run.status === "running") {
      diagnosis.kind = "stuck_no_finalize";
      diagnosis.title = "Run never finalized (still 'running')";
      diagnosis.details =
        "The run row was created but never transitioned to success/failed. The handler likely crashed or its update silently failed.";
      diagnosis.suggested_fix = "Click 'Recover Stuck Runs' to mark it failed, then re-run.";
    } else if (run.status === "failed" && /invalid input value for enum|status/i.test(lastError)) {
      diagnosis.kind = "enum_mismatch";
      diagnosis.title = "Enum mismatch on run.status update";
      diagnosis.details = lastError;
      const m = lastError.match(/invalid input value for enum [^:]+:\s*"([^"]+)"/i);
      if (m) diagnosis.offending_value = m[1];
      diagnosis.allowed_values = allowedRunStatus;
      diagnosis.suggested_fix =
        `pricing_v2_runs.status only accepts ${allowedRunStatus.join(", ")}. ` +
        `Update the server function to write one of those exact values.`;
    } else if (run.status === "failed" && /violates|constraint|null value/i.test(lastError)) {
      diagnosis.kind = "constraint_violation";
      diagnosis.title = "Constraint violation while finalizing run";
      diagnosis.details = lastError;
      diagnosis.suggested_fix =
        "Inspect the message above for the exact column / constraint and fix the write payload.";
    } else if (run.status === "failed") {
      diagnosis.kind = "unknown_failure";
      diagnosis.title = "Run finalized as failed";
      diagnosis.details = lastError || "No last_error captured — check server function logs.";
    } else if (finalizationLikelyFailed) {
      diagnosis.kind = "unknown_failure";
      diagnosis.title = "Possible finalization issue";
      diagnosis.details = lastError || "Run state looks inconsistent.";
    }

    return {
      run,
      errors: errorList,
      diagnosis,
      enums: {
        run_status: allowedRunStatus,
        severity: allowedSeverity,
      },
    };
  });

// ---- Listing helpers ------------------------------------------------------

export const listCatalogRunErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        run_id: z.string().uuid().optional(),
        severity: z.enum(["warning", "error", "critical"]).optional(),
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
      .in("stage", ["catalog", "catalog_bootstrap_test"])
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
      .select(
        "run_id, status, started_at, ended_at, counts_in, counts_out, warnings_count, errors_count, params, notes, last_error, stage, initiated_by, triggered_by"
      )
      .in("stage", ["catalog", "catalog_bootstrap_test"])
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    const runs = data ?? [];

    // Enrich with initiator email/full_name (best-effort; don't fail the list).
    const userIds = Array.from(
      new Set(runs.map((r: any) => r.initiated_by).filter(Boolean) as string[])
    );
    let profilesById: Record<string, { email: string | null; full_name: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);
      for (const p of profs ?? []) {
        profilesById[p.user_id] = { email: p.email ?? null, full_name: p.full_name ?? null };
      }
    }

    const enriched = runs.map((r: any) => {
      const startedMs = r.started_at ? new Date(r.started_at).getTime() : null;
      const endedMs = r.ended_at ? new Date(r.ended_at).getTime() : null;
      const durationMs = startedMs && endedMs ? endedMs - startedMs : null;
      const prof = r.initiated_by ? profilesById[r.initiated_by] : null;
      return {
        ...r,
        duration_ms: durationMs,
        initiator: {
          user_id: r.initiated_by ?? null,
          email: prof?.email ?? null,
          full_name: prof?.full_name ?? null,
        },
        products_fetched: r.counts_out ?? 0,
      };
    });

    return { runs: enriched };
  });

// ---- Stuck-recovery alerts (banner + config) -----------------------------

export const listActiveStuckAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_alert_events")
      .select("id, run_id, stage, stuck_for_minutes, threshold_minutes, message, channels, created_at")
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { alerts: data ?? [] };
  });

export const acknowledgeStuckAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("pricing_v2_alert_events")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAlertConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const cfg = await loadAlertConfig(supabase);
    return cfg;
  });

const alertConfigSchema = z.object({
  stuck_minutes_threshold: z.number().int().min(1).max(1440),
  banner_enabled: z.boolean(),
  email_enabled: z.boolean(),
  email_recipients: z.array(z.string().email()).max(20),
  webhook_enabled: z.boolean(),
  webhook_url: z.string().url().nullable().or(z.literal("").transform(() => null)),
  webhook_secret: z.string().max(200).nullable().or(z.literal("").transform(() => null)),
});

export const saveAlertConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alertConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_alert_config")
      .update({
        stuck_minutes_threshold: data.stuck_minutes_threshold,
        banner_enabled: data.banner_enabled,
        email_enabled: data.email_enabled,
        email_recipients: data.email_recipients,
        webhook_enabled: data.webhook_enabled,
        webhook_url: data.webhook_url,
        webhook_secret: data.webhook_secret,
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Send a synthetic stuck-recovery alert through all enabled channels so the
// admin can verify recipients/webhook connectivity without waiting for a real
// stuck run. Uses current persisted alert config (not unsaved form state).
export const testAlertConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const req = getRequest();
    const baseUrl = new URL(req.url).origin;
    const fakeBreach: RecoveredRunBreach = {
      run_id: "00000000-0000-0000-0000-000000000000",
      stage: "catalog",
      stuck_for_minutes: 999,
      started_at: new Date(Date.now() - 999 * 60_000).toISOString(),
      counts_in: 0,
      counts_out: 0,
      warnings_count: 0,
      errors_count: 0,
      message: "TEST ALERT — synthetic event from admin settings panel",
    };
    const result = await dispatchStuckRecoveryAlerts(supabase, [fakeBreach], baseUrl);
    return { ok: true, fired: result.fired, events: result.events };
  });

// ---- Manual weight override ----------------------------------------------

const setManualWeightSchema = z
  .object({
    product_key: z.string().min(1).max(200),
    // Either provide a raw string (preferred — gets normalized + unit-aware)
    weight_input: z.string().min(1).max(50).optional(),
    // …or a numeric grams value (legacy path; still validated server-side).
    grams: z.number().positive().max(1_000_000).optional(),
    reason: z.string().min(1).max(500),
    weight_source: z
      .enum(["manual_override", "parsed", "label", "vendor", "estimated", "unparsed", "unknown"])
      .default("manual_override"),
    // When true, save even if the value is inconsistent with size_raw.
    force_override: z.boolean().default(false),
  })
  .refine((d) => d.weight_input != null || d.grams != null, {
    message: "Provide weight_input or grams.",
  });

export const setManualWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setManualWeightSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    // 1) Normalize the input into grams (string path is preferred).
    let grams: number;
    let normalized_from: string | null = null;
    let unit: string = "g";
    if (data.weight_input) {
      const norm = normalizeWeightInput(data.weight_input);
      if (!norm.ok) {
        return { ok: false as const, kind: "invalid_input" as const, message: norm.reason };
      }
      grams = norm.grams;
      unit = norm.unit;
      normalized_from = data.weight_input;
    } else {
      grams = data.grams!;
    }

    // 2) Load the row so we can compare against size_raw.
    const { data: item, error: e1 } = await supabase
      .from("pricing_v2_item_catalog")
      .select("product_key, store_id, kroger_product_id, size_raw")
      .eq("product_key", data.product_key)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!item) throw new Error("Item not found");

    // 3) Try to parse size_raw (and the latest raw payload as a fallback) for
    //    a consistency check. This is best-effort — any failure is treated as
    //    "not comparable" rather than blocking the override.
    let parsed: ReturnType<typeof parseWeightToGrams> | null = null;
    try {
      const { data: raw } = await supabase
        .from("pricing_v2_kroger_catalog_raw")
        .select("size_raw, payload_json")
        .eq("store_id", item.store_id)
        .eq("kroger_product_id", item.kroger_product_id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      parsed = parseWeightToGrams({
        size_raw: raw?.size_raw ?? item.size_raw,
        payload_json: raw?.payload_json ?? null,
      });
    } catch {
      parsed = null;
    }

    const cmp = compareWithSizeRaw(grams, parsed);

    // 4) If we *can* compare and the values disagree, return a structured
    //    inconsistency response so the UI can surface a confirm-to-override
    //    flow instead of silently saving a bad weight.
    if (cmp.comparable && !cmp.consistent && !data.force_override) {
      return {
        ok: false as const,
        kind: "inconsistent_with_size" as const,
        message:
          `Entered weight (${Math.round(grams)} g) is ${(cmp.ratio * 100).toFixed(0)}% of the value parsed from "${item.size_raw ?? "size_raw"}" (~${Math.round(cmp.parsed_grams)} g). ` +
          `Confirm to save anyway, or correct the value.`,
        manual_grams: grams,
        manual_unit: unit,
        size_raw: item.size_raw,
        parsed_grams: cmp.parsed_grams,
        ratio: cmp.ratio,
      };
    }

    // 5) Persist. Reason must include the override note; if forced past the
    //    consistency check, append a marker for the audit trail.
    const finalReason =
      cmp.comparable && !cmp.consistent && data.force_override
        ? `${data.reason} [override: parsed≈${Math.round(cmp.parsed_grams)} g, entered=${Math.round(grams)} g]`
        : data.reason;

    const { error } = await supabase
      .from("pricing_v2_item_catalog")
      .update({
        manual_net_weight_grams: grams,
        manual_override_reason: finalReason,
        net_weight_grams: grams,
        weight_source: data.weight_source,
      })
      .eq("product_key", data.product_key);
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      grams,
      unit,
      normalized_from,
      compared: cmp.comparable
        ? { parsed_grams: cmp.parsed_grams, ratio: cmp.ratio, consistent: cmp.consistent }
        : null,
    };
  });

// ---- Bulk: set manual weight + source across multiple products -----------

const bulkSetManualWeightSchema = z.object({
  product_keys: z.array(z.string().min(1).max(200)).min(1).max(500),
  weight_input: z.string().min(1).max(50),
  reason: z.string().min(1).max(500),
  weight_source: z
    .enum(["manual_override", "parsed", "label", "vendor", "estimated", "unparsed", "unknown"])
    .default("manual_override"),
  // When true, save inconsistent rows anyway (audit-tagged). When false,
  // inconsistent rows are reported back as skipped so the user can confirm.
  force_override: z.boolean().default(false),
});

export const bulkSetManualWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkSetManualWeightSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    const norm = normalizeWeightInput(data.weight_input);
    if (!norm.ok) {
      return {
        ok: false as const,
        kind: "invalid_input" as const,
        message: norm.reason,
        updated: 0,
        skipped: [] as Array<{ product_key: string; reason: string; parsed_grams?: number; ratio?: number }>,
        failed: [] as Array<{ product_key: string; message: string }>,
      };
    }
    const grams = norm.grams;
    const unit = norm.unit;

    const { data: items, error: e1 } = await supabase
      .from("pricing_v2_item_catalog")
      .select("product_key, store_id, kroger_product_id, size_raw")
      .in("product_key", data.product_keys);
    if (e1) throw new Error(e1.message);

    const found = new Map<string, any>((items ?? []).map((r: any) => [r.product_key, r]));
    const updated: string[] = [];
    const skipped: Array<{ product_key: string; reason: string; parsed_grams?: number; ratio?: number }> = [];
    const failed: Array<{ product_key: string; message: string }> = [];

    for (const key of data.product_keys) {
      const item = found.get(key);
      if (!item) {
        failed.push({ product_key: key, message: "not found" });
        continue;
      }

      let parsed: ReturnType<typeof parseWeightToGrams> | null = null;
      try {
        const { data: raw } = await supabase
          .from("pricing_v2_kroger_catalog_raw")
          .select("size_raw, payload_json")
          .eq("store_id", item.store_id)
          .eq("kroger_product_id", item.kroger_product_id)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        parsed = parseWeightToGrams({
          size_raw: raw?.size_raw ?? item.size_raw,
          payload_json: raw?.payload_json ?? null,
        });
      } catch {
        parsed = null;
      }

      const cmp = compareWithSizeRaw(grams, parsed);
      if (cmp.comparable && !cmp.consistent && !data.force_override) {
        skipped.push({
          product_key: key,
          reason: `inconsistent with size_raw "${item.size_raw ?? "—"}"`,
          parsed_grams: cmp.parsed_grams,
          ratio: cmp.ratio,
        });
        continue;
      }

      const finalReason =
        cmp.comparable && !cmp.consistent && data.force_override
          ? `${data.reason} [bulk override: parsed≈${Math.round(cmp.parsed_grams)} g, entered=${Math.round(grams)} g]`
          : `${data.reason} [bulk]`;

      const { error } = await supabase
        .from("pricing_v2_item_catalog")
        .update({
          manual_net_weight_grams: grams,
          manual_override_reason: finalReason,
          net_weight_grams: grams,
          weight_source: data.weight_source,
        })
        .eq("product_key", key);

      if (error) {
        failed.push({ product_key: key, message: error.message });
      } else {
        updated.push(key);
      }
    }

    return {
      ok: true as const,
      grams,
      unit,
      requested: data.product_keys.length,
      updated: updated.length,
      updated_keys: updated,
      skipped,
      failed,
    };
  });

// ---- List catalog products (for per-row Fix Weight UI) -------------------

export const listCatalogProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        weight_source: z.string().max(50).optional(),
        only_missing_weight: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_item_catalog")
      .select(
        "product_key, store_id, kroger_product_id, upc, name, brand, size_raw, net_weight_grams, weight_source, manual_net_weight_grams, manual_override_reason, updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.search && data.search.trim()) {
      const s = data.search.trim().replace(/[%_]/g, "");
      q = q.or(
        `name.ilike.%${s}%,brand.ilike.%${s}%,upc.ilike.%${s}%,kroger_product_id.ilike.%${s}%,product_key.ilike.%${s}%`
      );
    }
    if (data.weight_source) q = q.eq("weight_source", data.weight_source);
    if (data.only_missing_weight) q = q.is("net_weight_grams", null);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { products: rows ?? [], total: count ?? 0 };
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

// ---- Stage 0 Test Harness -------------------------------------------------
//
// Deterministic tests for catalog bootstrap + weight parsing. Runs under its
// own stage `catalog_bootstrap_test` so it doesn't pollute real catalog runs.
// Synthetic raw rows are persisted with TEST: prefixed product_keys so they
// can be inspected (and later purged) without affecting live catalog data.

const TEST_STAGE = "catalog_bootstrap_test" as const;
const TEST_STORE_ID = "TEST";
const TEST_TOLERANCE_G = 0.001;

type TestCase = {
  id: string;          // stable id used in product_key
  name: string;
  size_raw: string | null;
  expect_ok: boolean;
  expect_grams?: number;
  expect_error_type?: "MISSING_SIZE" | "VOLUME_ONLY" | "WEIGHT_PARSE_FAIL" | "ZERO_OR_NEG_WEIGHT";
};

const TEST_CASES: TestCase[] = [
  // PASS
  { id: "A_oz",     name: "A) 16 oz → 453.59237 g",        size_raw: "16 oz",     expect_ok: true,  expect_grams: 16 * G_PER_OZ_CONST() },
  { id: "B_mult",   name: "B) 2 x 16 oz → 907.18474 g",    size_raw: "2 x 16 oz", expect_ok: true,  expect_grams: 2 * 16 * G_PER_OZ_CONST() },
  { id: "C_lb",     name: "C) 5 lb → 2267.96185 g",        size_raw: "5 lb",      expect_ok: true,  expect_grams: 5 * 453.59237 },
  // FAIL
  { id: "D_missing", name: "D) empty/null → MISSING_SIZE", size_raw: null,        expect_ok: false, expect_error_type: "MISSING_SIZE" },
  { id: "E_volume",  name: "E) 1 gal → VOLUME_ONLY",       size_raw: "1 gal",     expect_ok: false, expect_error_type: "VOLUME_ONLY" },
  { id: "F_each",    name: "F) 12 ct → WEIGHT_PARSE_FAIL", size_raw: "12 ct",     expect_ok: false, expect_error_type: "WEIGHT_PARSE_FAIL" },
];

// Local constant proxy so TEST_CASES can reference numeric expectations
// without importing the parser's private constant.
function G_PER_OZ_CONST(): number { return 28.349523125; }

export const runCatalogTestHarness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    // 1) Create the test run record under the dedicated stage.
    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: TEST_STAGE,
        status: "running",
        initiated_by: userId ?? null,
        triggered_by: "test_harness",
        params: { test_harness: true, test_count: TEST_CASES.length },
        notes: "Stage 0 catalog test harness (parser + raw + catalog upsert)",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId: string = runRow.run_id;

    const results: Array<{
      id: string;
      name: string;
      pass: boolean;
      expect_ok: boolean;
      expect_grams?: number;
      expect_error_type?: string;
      actual_grams: number | null;
      actual_error_type: string | null;
      actual_reason: string | null;
      product_key: string;
      detail: string;
    }> = [];
    const errs: ErrorRow[] = [];
    let countsIn = 0;
    let countsOut = 0;

    try {
      for (const tc of TEST_CASES) {
        countsIn += 1;
        const productKey = `TEST:${runId}:${tc.id}`;
        const krogerProductId = `TEST_${tc.id}`;

        // 1a) Insert synthetic raw row.
        await supabase.from("pricing_v2_kroger_catalog_raw").insert({
          run_id: runId,
          store_id: TEST_STORE_ID,
          kroger_product_id: krogerProductId,
          upc: null,
          name: `Test case ${tc.id}`,
          brand: "TEST_HARNESS",
          size_raw: tc.size_raw,
          payload_json: { test_case: tc.id, size_raw: tc.size_raw },
        });

        // 1b) Run the same parser used by the real bootstrap.
        const r = parseWeightToGrams({ size_raw: tc.size_raw });

        // 1c) Determine pass/fail vs expectation.
        let pass = r.ok === tc.expect_ok;
        let detail = "";
        if (pass && tc.expect_ok && tc.expect_grams != null && r.ok) {
          const diff = Math.abs(r.net_weight_grams - tc.expect_grams);
          if (diff > TEST_TOLERANCE_G) {
            pass = false;
            detail = `weight off by ${diff.toFixed(4)} g (expected ${tc.expect_grams.toFixed(5)}, got ${r.net_weight_grams.toFixed(5)})`;
          } else {
            detail = `weight matches within ${TEST_TOLERANCE_G} g`;
          }
        }
        if (pass && !tc.expect_ok && !r.ok && tc.expect_error_type) {
          if (r.failure !== tc.expect_error_type) {
            pass = false;
            detail = `expected error type ${tc.expect_error_type}, got ${r.failure}`;
          } else {
            detail = `error type matches: ${r.failure}`;
          }
        }
        if (!detail) {
          detail = pass
            ? "outcome matches expectation"
            : `expected_ok=${tc.expect_ok} but got_ok=${r.ok}`;
        }

        // 1d) Upsert into item catalog. For failures, leave net_weight_grams
        //     null so the rule "missing/0/negative => null unless override" holds.
        const upsertGrams = r.ok ? r.net_weight_grams : null;
        const upsertSource = r.ok ? "parsed" : "unknown";
        const up = await supabase
          .from("pricing_v2_item_catalog")
          .upsert(
            {
              store_id: TEST_STORE_ID,
              product_key: productKey,
              kroger_product_id: krogerProductId,
              upc: null,
              name: `Test case ${tc.id}`,
              brand: "TEST_HARNESS",
              size_raw: tc.size_raw,
              net_weight_grams: upsertGrams,
              weight_source: upsertSource,
              manual_net_weight_grams: null,
              manual_override_reason: null,
              last_run_id: runId,
            },
            { onConflict: "product_key" }
          );
        if (!up.error) countsOut += 1;

        // 1e) Log uniform error for parse failures.
        if (!r.ok) {
          errs.push({
            run_id: runId,
            stage: TEST_STAGE,
            severity: "critical", // blocker per spec for D/E/F (DB enum: critical = blocker)
            type: r.failure,
            entity_type: "test_case",
            entity_id: productKey,
            entity_name: tc.name,
            message: r.reason,
            suggested_fix:
              r.failure === "VOLUME_ONLY"
                ? "Exclude volume-only items — pipeline is weight-only."
                : r.failure === "MISSING_SIZE"
                ? "Provide a size string before bootstrapping."
                : "Use Fix Weight to set manual_net_weight_grams with a reason.",
            debug_json: {
              test_case: tc.id,
              size_raw: tc.size_raw,
              reason: r.reason,
              trace: r.trace,
            },
          });
        }

        // 1f) If the test itself FAILED (parser regression vs expectation),
        //     also record a TEST_ASSERTION_FAILED error so QA sees it.
        if (!pass) {
          errs.push({
            run_id: runId,
            stage: TEST_STAGE,
            severity: "error",
            type: "TEST_ASSERTION_FAILED",
            entity_type: "test_case",
            entity_id: productKey,
            entity_name: tc.name,
            message: `Test "${tc.name}" failed: ${detail}`,
            suggested_fix: "Investigate parser regression or update test expectations.",
            debug_json: {
              test_case: tc.id,
              size_raw: tc.size_raw,
              expect_ok: tc.expect_ok,
              expect_grams: tc.expect_grams ?? null,
              expect_error_type: tc.expect_error_type ?? null,
              actual: r,
            },
          });
        }

        results.push({
          id: tc.id,
          name: tc.name,
          pass,
          expect_ok: tc.expect_ok,
          expect_grams: tc.expect_grams,
          expect_error_type: tc.expect_error_type,
          actual_grams: r.ok ? r.net_weight_grams : null,
          actual_error_type: r.ok ? null : r.failure,
          actual_reason: r.ok ? null : r.reason,
          product_key: productKey,
          detail,
        });
      }

      // 2) Persist all errors in one batch.
      if (errs.length) {
        await supabase.from("pricing_v2_errors").insert(errs);
      }

      const passed = results.filter((r) => r.pass).length;
      const failed = results.length - passed;
      const warningsCount = errs.filter((e) => e.severity === "warning").length;
      const errorsCount = errs.filter((e) => e.severity === "error" || e.severity === "critical").length;

      // 3) Finalize run.
      await supabase
        .from("pricing_v2_runs")
        .update({
          status: failed === 0 ? "success" : "failed",
          ended_at: new Date().toISOString(),
          counts_in: countsIn,
          counts_out: countsOut,
          warnings_count: warningsCount,
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
        warnings_count: warningsCount,
        errors_count: errorsCount,
        results,
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
        })
        .eq("run_id", runId);
      throw e;
    }
  });

// List errors for the test stage (used by the test results UI).
export const listCatalogTestErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ run_id: z.string().uuid(), limit: z.number().int().min(1).max(1000).default(500) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("pricing_v2_errors")
      .select("*")
      .eq("stage", TEST_STAGE)
      .eq("run_id", data.run_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { errors: rows ?? [] };
  });
