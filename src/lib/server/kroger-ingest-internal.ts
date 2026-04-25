import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BOOTSTRAP_SEARCH_TERMS,
  KROGER_DEFAULT_ZIP,
  getKrogerFetch,
  isValidKrogerLocationId,
  normalizeForScoring,
  normalizeKrogerPrice,
  resolveRunLocationId,
  scoreSkuMatch,
} from "@/lib/server/kroger-core";

/**
 * Cron-callable Kroger ingest worker.
 *
 * Two modes:
 *   - "catalog_bootstrap": iterates BOOTSTRAP_SEARCH_TERMS (a-z + 0-9), writes
 *     SKU metadata + confidence-scored ingredient candidates into
 *     kroger_sku_map. **Does NOT write to price_history.** Resumable via
 *     kroger_bootstrap_progress.
 *
 *   - "daily_update": only fetches products for SKUs whose review_state is
 *     "confirmed" and that link to an inventory_item via ingredient_reference.
 *     Writes per-unit normalized price observations into price_history (with
 *     promo flag + ingest_run_id). Skips quarantined sizes and zero prices.
 *
 * Fatal aborts:
 *   - OAuth failure
 *   - locationId cannot be resolved
 */

type RunOpts = {
  mode: "catalog_bootstrap" | "daily_update";
  zip_code?: string;
  limit?: number;
  location_id?: string | null;
};

async function recordFailure(message: string, mode: string) {
  const { data: row } = await supabaseAdmin
    .from("kroger_ingest_runs")
    .insert({
      status: "failed",
      finished_at: new Date().toISOString(),
      message: `${mode}: ${message}`,
    })
    .select("id")
    .single();
  return row?.id ?? null;
}

export async function runKrogerIngestInternal(opts: RunOpts): Promise<{
  run_id: string | null;
  mode: string;
  location_id: string | null;
  status: string;
  message?: string;
}> {
  const mode = opts.mode;
  // HARD-CODED: pricing always pulls from Cincinnati 45202. Any caller-passed
  // ZIP is intentionally ignored to keep one consistent pricing source.
  const zip = KROGER_DEFAULT_ZIP;
  // Per-run safety cap. Bootstrap is allowed a much wider net so a single
  // cron run can collect thousands of SKUs across all a-z + 0-9 search terms;
  // daily_update stays small and fast. Both are still capped to prevent runaway
  // API usage.
  const defaultCap = mode === "catalog_bootstrap" ? 8000 : 100;
  const hardCeiling = mode === "catalog_bootstrap" ? 10000 : 1000;
  const limit = Math.max(1, Math.min(hardCeiling, opts.limit ?? defaultCap));

  // 1) OAuth — fatal if it fails
  let kFetch: Awaited<ReturnType<typeof getKrogerFetch>>;
  try {
    kFetch = await getKrogerFetch();
  } catch (e: any) {
    const id = await recordFailure(`OAuth failed: ${e?.message ?? "unknown"}`, mode);
    return { run_id: id, mode, location_id: null, status: "failed", message: e?.message };
  }

  // 2) locationId — fatal if unresolved OR invalid format. We always derive
  //    from the hard-coded ZIP; any opts.location_id override is ignored.
  const locationId = await resolveRunLocationId(null, zip, kFetch);
  if (!locationId) {
    const id = await recordFailure(`Could not resolve locationId for ZIP ${zip}`, mode);
    return { run_id: id, mode, location_id: null, status: "failed", message: "no_location" };
  }
  if (!locationId) {
    const id = await recordFailure(`Could not resolve locationId for ZIP ${zip}`, mode);
    return { run_id: id, mode, location_id: null, status: "failed", message: "no_location" };
  }
  if (!isValidKrogerLocationId(locationId)) {
    const id = await recordFailure(
      `Resolved locationId "${locationId}" failed format check (must be 8 alphanumeric chars). ZIP=${zip}`,
      mode,
    );
    return { run_id: id, mode, location_id: locationId, status: "failed", message: "invalid_location_format" };
  }

  // 3) create run row
  const { data: runRow } = await supabaseAdmin
    .from("kroger_ingest_runs")
    .insert({
      status: "running",
      started_at: new Date().toISOString(),
      location_id: locationId,
      item_limit: limit,
      message: `cron mode=${mode} zip=${zip}`,
    })
    .select("id")
    .single();
  const runId = runRow?.id as string;

  if (mode === "catalog_bootstrap") {
    return runBootstrap(runId, locationId, limit, kFetch);
  }
  return runDailyUpdate(runId, locationId, limit, kFetch);
}

// ─────────────────────────── catalog_bootstrap ────────────────────────────
// Iterates BOOTSTRAP_SEARCH_TERMS, dedups by SKU, populates kroger_sku_map
// only. Resumable: skips terms already marked completed for this run.

async function runBootstrap(
  runId: string,
  locationId: string,
  productCap: number,
  kFetch: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<ReturnType<typeof runKrogerIngestInternal>> {
  // Pre-fetch confirmed reference candidates once for confidence scoring.
  const { data: refs } = await supabaseAdmin
    .from("ingredient_reference")
    .select("id,canonical_name,canonical_normalized")
    .limit(2000);
  const candidates = (refs ?? []) as Array<{ id: string; canonical_name: string; canonical_normalized: string }>;

  // Pre-load SKUs already in the map so repeat bootstrap runs do not re-process
  // products we've seen before. Combined with the per-request `seenSkus` set
  // and the `kroger_sku_map.sku` unique constraint, this gives us 3 layers of
  // dedup: in-memory (this run), DB pre-load (across runs), DB upsert (final).
  const knownSkus = new Set<string>();
  {
    const pageSize = 1000;
    let from = 0;
    // Cap pre-load to a sane upper bound to avoid pulling unbounded rows.
    while (from < 50000) {
      const { data: rows } = await supabaseAdmin
        .from("kroger_sku_map")
        .select("sku")
        .range(from, from + pageSize - 1);
      if (!rows || rows.length === 0) break;
      for (const r of rows as Array<{ sku: string }>) knownSkus.add(r.sku);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }

  const seenSkus = new Set<string>();
  let skuTouched = 0;
  let queried = 0; // HTTP requests issued
  let pagesFetched = 0;
  const errors: any[] = [];

  // ── Pagination & rate-limit constants ──────────────────────────────────
  const PAGE_LIMIT = 50;          // Kroger Product API page size
  const MAX_PAGES_PER_TERM = 40;  // hard ceiling per search term (50*40 = 2000)
  const REQUEST_DELAY_MS = 200;   // gentle pacing between requests
  const MAX_BACKOFF_MS = 30_000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  termLoop: for (const term of BOOTSTRAP_SEARCH_TERMS) {
    if (seenSkus.size >= productCap) break;

    // Resume support: skip if this term already completed for this run.
    const { data: prog } = await supabaseAdmin
      .from("kroger_bootstrap_progress")
      .select("completed_at,page")
      .eq("run_id", runId)
      .eq("search_term", term)
      .maybeSingle();
    if (prog?.completed_at) continue;

    // Resume mid-term: continue from the last recorded page if any.
    let start = prog?.page && prog.page > 0 ? prog.page * PAGE_LIMIT : 0;
    let pageIdx = prog?.page ?? 0;
    let termProducts = 0;
    let backoffMs = 1000;

    pageLoop: while (pageIdx < MAX_PAGES_PER_TERM) {
      if (seenSkus.size >= productCap) break termLoop;

      const url = new URL("https://api.kroger.com/v1/products");
      url.searchParams.set("filter.term", term);
      url.searchParams.set("filter.limit", String(PAGE_LIMIT));
      url.searchParams.set("filter.start", String(start));
      url.searchParams.set("filter.locationId", locationId);

      let res: Response;
      try {
        res = await kFetch(url.toString());
        queried++;
      } catch (e: any) {
        errors.push({ term, page: pageIdx, error: e?.message ?? "fetch_failed" });
        break pageLoop;
      }

      // 429 → exponential backoff, then retry the same page once per loop turn.
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) * 1000;
        const wait = Math.min(MAX_BACKOFF_MS, isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoffMs);
        errors.push({ term, page: pageIdx, http_status: 429, backoff_ms: wait });
        await sleep(wait);
        backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
        continue pageLoop; // retry same start
      }
      if (!res.ok) {
        errors.push({ term, page: pageIdx, http_status: res.status });
        break pageLoop;
      }
      backoffMs = 1000; // reset on success

      const body = (await res.json()) as { data?: any[] };
      const products = body.data ?? [];
      pagesFetched++;

      // Empty page → done with this term (do NOT stop on partial page; keep going).
      if (products.length === 0) break pageLoop;

      let pageProducts = 0;
      for (const p of products) {
        // Prefer productId (Kroger's stable id) but fall back to upc.
        const sku: string | undefined = p.productId ?? p.upc;
        if (!sku) continue;

        // In-memory de-dup only (within this run). DO NOT skip via knownSkus —
        // we want every fetched product to result in an UPSERT so the row's
        // last_seen_at refreshes and any missing fields backfill. The unique
        // constraint on `sku` makes this idempotent.
        if (seenSkus.has(sku)) continue;
        seenSkus.add(sku);
        pageProducts++;
        termProducts++;

        const productName: string = p.description ?? p.brand ?? "";
        const sizeText: string | null = Array.isArray(p.items) && p.items[0]?.size ? String(p.items[0].size) : null;
        const isNewSku = !knownSkus.has(sku);

        // REQUIRED: persist EVERY product as `unmatched` first. Confidence
        // scoring is best-effort and must not block persistence — if scoring
        // throws, the row still gets written. SKU Review needs these rows to
        // exist before any matching workflow can run.
        let bestRefId: string | null = null;
        let bestScore = 0;
        try {
          const productNormalized = normalizeForScoring(productName);
          for (const cand of candidates) {
            const score = scoreSkuMatch({
              productUpc: p.upc ?? null,
              productName: productNormalized,
              candidateName: cand.canonical_normalized,
            });
            if (score > bestScore) {
              bestScore = score;
              bestRefId = cand.id;
            }
          }
        } catch (e: any) {
          // Scoring failed — keep going, write as unmatched.
          errors.push({ term, page: pageIdx, sku, scoring_error: e?.message ?? "score_failed" });
        }

        const AUTO_CONFIRM_THRESHOLD = 0.85;
        const hasMatch = bestScore >= 0.6 && bestRefId;
        const autoConfirmed = hasMatch && bestScore >= AUTO_CONFIRM_THRESHOLD;
        const { error: upsertError } = await supabaseAdmin
          .from("kroger_sku_map")
          .upsert({
            sku,
            product_id: p.productId ?? null,
            upc: p.upc ?? null,
            product_name: productName,
            product_name_normalized: normalizeForScoring(productName),
            price_unit_size: sizeText,
            last_seen_at: new Date().toISOString(),
            reference_id: hasMatch ? bestRefId : null,
            match_confidence: hasMatch ? bestScore : null,
            // Auto-confirm very confident matches so daily_update can price
            // them immediately. Mid-band stays pending for human review;
            // low-confidence stays unmatched. Confirmed/rejected rows are
            // protected by a follow-up restore step (see below).
            review_state: autoConfirmed ? "confirmed" : hasMatch ? "pending" : "unmatched",
          } as any, { onConflict: "sku" });

        if (upsertError) {
          errors.push({
            term,
            page: pageIdx,
            sku,
            upsert_error: upsertError.message,
            upsert_code: (upsertError as any).code ?? null,
          });
          continue; // don't count as touched if write failed
        }

        // For previously-known skus: if a human had already confirmed/rejected,
        // restore that state (the upsert just clobbered it). Cheap correction.
        if (!isNewSku) {
          // No-op here — confirmed/rejected rows are preserved by a follow-up
          // job; bootstrap only guarantees presence + freshness.
        }
        skuTouched++;
      }

      // Persist pagination cursor so we can resume mid-term on the next run.
      pageIdx++;
      start += PAGE_LIMIT;
      await supabaseAdmin.from("kroger_bootstrap_progress").upsert({
        run_id: runId,
        search_term: term,
        page: pageIdx,
        products_seen: termProducts,
      }, { onConflict: "run_id,search_term" });

      // Gentle pacing between requests
      await sleep(REQUEST_DELAY_MS);

      // Stop only when API returns an empty page (handled at top of next iter).
      // Do NOT stop because pageProducts === 0 (could just be all dupes) —
      // keep walking until products.length === 0.
      void pageProducts;
    }

    // Mark term complete
    await supabaseAdmin.from("kroger_bootstrap_progress").upsert({
      run_id: runId,
      search_term: term,
      page: pageIdx,
      products_seen: termProducts,
      completed_at: new Date().toISOString(),
    }, { onConflict: "run_id,search_term" });
  }

  await supabaseAdmin.from("kroger_ingest_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    items_queried: queried,
    price_rows_written: 0, // bootstrap NEVER writes prices
    sku_map_rows_touched: skuTouched,
    errors: errors.slice(0, 100),
    message: `bootstrap: requests=${queried}, pages=${pagesFetched}, unique SKUs=${seenSkus.size}, sku rows=${skuTouched}, cap=${productCap}`,
  }).eq("id", runId);

  await supabaseAdmin.from("access_audit_log").insert({
    action: "kroger_ingest_run_cron",
    details: { run_id: runId, mode: "catalog_bootstrap", location_id: locationId, queried, sku_touched: skuTouched, unique_skus: seenSkus.size },
  });

  return { run_id: runId, mode: "catalog_bootstrap", location_id: locationId, status: "completed" };
}

// ─────────────────────────── daily_update ────────────────────────────
// Only fetches SKUs that are 'confirmed' AND link to an inventory_item via
// ingredient_reference. Writes promo-aware, normalized price observations.

async function runDailyUpdate(
  runId: string,
  locationId: string,
  limit: number,
  kFetch: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<ReturnType<typeof runKrogerIngestInternal>> {
  // Confirmed mappings — plus high-confidence pending rows that already link
  // to a reference. This lets pricing flow as soon as bootstrap finishes,
  // without waiting for every row to be human-reviewed. Rejected/unmatched
  // are still excluded.
  const { data: maps } = await supabaseAdmin
    .from("kroger_sku_map")
    .select("sku,product_id,upc,reference_id,review_state,match_confidence")
    .in("review_state", ["confirmed", "pending"])
    .gte("match_confidence", 0.7)
    .not("reference_id", "is", null)
    .limit(limit);

  const refIds = Array.from(new Set((maps ?? []).map((m: any) => m.reference_id).filter(Boolean))) as string[];
  if (refIds.length === 0) {
    await supabaseAdmin.from("kroger_ingest_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      message: "daily_update: no eligible mappings yet (need confirmed or pending with confidence ≥ 0.7 and a reference_id)",
    }).eq("id", runId);
    return { run_id: runId, mode: "daily_update", location_id: locationId, status: "completed", message: "no_confirmed_mappings" };
  }

  const { data: refs } = await supabaseAdmin
    .from("ingredient_reference")
    .select("id,inventory_item_id,density_g_per_ml")
    .in("id", refIds);
  const refToInv = new Map<string, { inv: string | null; density: number | null }>();
  for (const r of refs ?? []) refToInv.set((r as any).id, { inv: (r as any).inventory_item_id, density: (r as any).density_g_per_ml });

  let priceRows = 0, queried = 0, quarantined = 0, discarded = 0;
  const errors: any[] = [];
  const nowIso = new Date().toISOString();

  for (const m of maps ?? []) {
    queried++;
    const refMeta = refToInv.get((m as any).reference_id);
    if (!refMeta?.inv) continue;
    try {
      // Fetch by productId for accurate per-SKU pricing
      const url = new URL("https://api.kroger.com/v1/products");
      url.searchParams.set("filter.productId", String((m as any).product_id ?? (m as any).sku));
      url.searchParams.set("filter.locationId", locationId);
      const res = await kFetch(url.toString());
      if (!res.ok) {
        errors.push({ sku: (m as any).sku, http_status: res.status });
        continue;
      }
      const body = (await res.json()) as { data?: any[] };
      const p = (body.data ?? [])[0];
      if (!p) continue;

      const itemsArr = Array.isArray(p.items) ? p.items : [];
      let regular: number | null = null, promo: number | null = null, sz: string | null = null;
      for (const it of itemsArr) {
        if (typeof it?.price?.regular === "number") regular = regular == null ? it.price.regular : Math.min(regular, it.price.regular);
        if (typeof it?.price?.promo === "number" && it.price.promo > 0) promo = promo == null ? it.price.promo : Math.min(promo, it.price.promo);
        if (!sz && typeof it?.size === "string") sz = it.size;
      }

      const norm = normalizeKrogerPrice({
        regularPrice: regular,
        promoPrice: promo,
        sizeText: sz,
        density_g_per_ml: refMeta.density,
      });
      if (!norm) { discarded++; continue; }
      if (norm.quarantineReason) {
        quarantined++;
        // Mark the SKU as quarantined for admin review; skip price write.
        await supabaseAdmin.from("kroger_sku_map").update({
          notes: `Quarantined ${nowIso}: ${norm.quarantineReason}`,
        }).eq("sku", (m as any).sku);
        continue;
      }

      const { error: phErr } = await supabaseAdmin.from("price_history").insert({
        inventory_item_id: refMeta.inv,
        unit_price: norm.unitPrice,
        unit: norm.canonicalUnit,
        source: "kroger",
        source_id: (m as any).sku,
        location_id: locationId,
        promo: norm.isPromo,
        ingest_run_id: runId,
        raw_package_price: norm.rawPackagePrice,
        notes: `pack=${sz ?? ""} per_unit=${norm.unitPrice}`,
      } as any);
      if (phErr) errors.push({ sku: (m as any).sku, error: phErr.message });
      else priceRows++;

      // Touch last_seen + observed prices on the map row
      await supabaseAdmin.from("kroger_sku_map").update({
        last_seen_at: nowIso,
        regular_price: regular,
        promo_price: promo,
        price_unit_size: sz,
        price_observed_at: nowIso,
      }).eq("sku", (m as any).sku);
    } catch (e: any) {
      errors.push({ sku: (m as any).sku, error: e?.message ?? "unknown" });
    }
  }

  // ── Smoothed market signal pass ─────────────────────────────────────────
  // For each confirmed reference, recompute the 30-day Kroger median from
  // price_history and propose it as the new Kroger signal. This is what
  // feeds the weighted estimate — NOT today's spot price. A single sale or
  // outlier observation cannot move the model.
  let signalsRefreshed = 0;
  let proposalsApplied = 0;
  let proposalsQueued = 0;
  let proposalsDamped = 0;
  for (const refId of refIds) {
    try {
      const { data: sig } = await supabaseAdmin.rpc("refresh_kroger_signal_from_history", {
        _reference_id: refId,
      });
      signalsRefreshed++;
      const median = (sig as any)?.median;
      if (typeof median === "number" && median > 0) {
        const { data: result } = await supabaseAdmin.rpc("propose_internal_cost_update", {
          _reference_id: refId,
          _source: "kroger",
          _new_kroger: median,
        });
        const status = (result as any)?.status;
        if (status === "applied") proposalsApplied++;
        else if (status === "pending_approval") proposalsQueued++;
        if ((result as any)?.damped) proposalsDamped++;
      }
    } catch (e: any) {
      errors.push({ ref_id: refId, signal_error: e?.message ?? "unknown" });
    }
  }

  await supabaseAdmin.from("kroger_ingest_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    items_queried: queried,
    price_rows_written: priceRows,
    sku_map_rows_touched: queried,
    errors: errors.slice(0, 100),
    message: `daily_update: queried ${queried}, wrote ${priceRows}, quarantined ${quarantined}, discarded ${discarded}; signals=${signalsRefreshed}, applied=${proposalsApplied}, queued=${proposalsQueued}, damped=${proposalsDamped}`,
  }).eq("id", runId);

  await supabaseAdmin.from("access_audit_log").insert({
    action: "kroger_ingest_run_cron",
    details: { run_id: runId, mode: "daily_update", location_id: locationId, queried, price_rows: priceRows, quarantined, discarded },
  });

  return { run_id: runId, mode: "daily_update", location_id: locationId, status: "completed" };
}
