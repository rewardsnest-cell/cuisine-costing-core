import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BOOTSTRAP_SEARCH_TERMS,
  KROGER_DEFAULT_ZIP,
  getKrogerFetch,
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
  const zip = (opts.zip_code ?? KROGER_DEFAULT_ZIP).trim();
  const limit = Math.max(1, Math.min(5000, opts.limit ?? (mode === "catalog_bootstrap" ? 500 : 100)));

  // 1) OAuth — fatal if it fails
  let kFetch: Awaited<ReturnType<typeof getKrogerFetch>>;
  try {
    kFetch = await getKrogerFetch();
  } catch (e: any) {
    const id = await recordFailure(`OAuth failed: ${e?.message ?? "unknown"}`, mode);
    return { run_id: id, mode, location_id: null, status: "failed", message: e?.message };
  }

  // 2) locationId — fatal if unresolved
  const locationId = await resolveRunLocationId(opts.location_id ?? null, zip, kFetch);
  if (!locationId) {
    const id = await recordFailure(`Could not resolve locationId for ZIP ${zip}`, mode);
    return { run_id: id, mode, location_id: null, status: "failed", message: "no_location" };
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

  const seenSkus = new Set<string>();
  let skuTouched = 0;
  let queried = 0;
  const errors: any[] = [];

  for (const term of BOOTSTRAP_SEARCH_TERMS) {
    if (seenSkus.size >= productCap) break;

    // Resume support: skip if this term already completed for this run.
    const { data: prog } = await supabaseAdmin
      .from("kroger_bootstrap_progress")
      .select("completed_at")
      .eq("run_id", runId)
      .eq("search_term", term)
      .maybeSingle();
    if (prog?.completed_at) continue;

    let pageProducts = 0;
    try {
      const url = new URL("https://api.kroger.com/v1/products");
      url.searchParams.set("filter.term", term);
      url.searchParams.set("filter.limit", "50");
      url.searchParams.set("filter.locationId", locationId);
      const res = await kFetch(url.toString());
      queried++;
      if (!res.ok) {
        errors.push({ term, http_status: res.status });
        await supabaseAdmin.from("kroger_bootstrap_progress").upsert({
          run_id: runId, search_term: term, page: 1, products_seen: 0,
        }, { onConflict: "run_id,search_term" });
        continue;
      }
      const body = (await res.json()) as { data?: any[] };
      for (const p of body.data ?? []) {
        const sku: string | undefined = p.productId ?? p.upc;
        if (!sku || seenSkus.has(sku)) continue;
        seenSkus.add(sku);
        pageProducts++;

        const productName: string = p.description ?? p.brand ?? "";
        const sizeText: string | null = Array.isArray(p.items) && p.items[0]?.size ? String(p.items[0].size) : null;

        // Best ingredient_reference candidate by name match
        let bestRefId: string | null = null;
        let bestScore = 0;
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

        await supabaseAdmin.from("kroger_sku_map").upsert({
          sku,
          product_id: p.productId ?? null,
          upc: p.upc ?? null,
          product_name: productName,
          product_name_normalized: normalizeForScoring(productName),
          price_unit_size: sizeText,
          last_seen_at: new Date().toISOString(),
          // Only suggest a reference link when the score is meaningful.
          reference_id: bestScore >= 0.6 ? bestRefId : null,
          match_confidence: bestScore,
          // review_state defaults to 'auto' in DB. Suggested matches go to 'pending'.
          review_state: bestScore >= 0.6 ? "pending" : "auto",
        } as any, { onConflict: "sku" });
        skuTouched++;
      }

      await supabaseAdmin.from("kroger_bootstrap_progress").upsert({
        run_id: runId,
        search_term: term,
        page: 1,
        products_seen: pageProducts,
        completed_at: new Date().toISOString(),
      }, { onConflict: "run_id,search_term" });
    } catch (e: any) {
      errors.push({ term, error: e?.message ?? "unknown" });
    }
  }

  await supabaseAdmin.from("kroger_ingest_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    items_queried: queried,
    price_rows_written: 0, // bootstrap NEVER writes prices
    sku_map_rows_touched: skuTouched,
    errors: errors.slice(0, 100),
    message: `bootstrap: terms=${queried}, unique SKUs=${seenSkus.size}, sku rows=${skuTouched}`,
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
  // Confirmed mappings only
  const { data: maps } = await supabaseAdmin
    .from("kroger_sku_map")
    .select("sku,product_id,upc,reference_id")
    .eq("review_state", "confirmed")
    .not("reference_id", "is", null)
    .limit(limit);

  const refIds = Array.from(new Set((maps ?? []).map((m: any) => m.reference_id).filter(Boolean))) as string[];
  if (refIds.length === 0) {
    await supabaseAdmin.from("kroger_ingest_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      message: "daily_update: no confirmed mappings yet",
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

  await supabaseAdmin.from("kroger_ingest_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    items_queried: queried,
    price_rows_written: priceRows,
    sku_map_rows_touched: queried,
    errors: errors.slice(0, 100),
    message: `daily_update: queried ${queried}, wrote ${priceRows}, quarantined ${quarantined}, discarded ${discarded}`,
  }).eq("id", runId);

  await supabaseAdmin.from("access_audit_log").insert({
    action: "kroger_ingest_run_cron",
    details: { run_id: runId, mode: "daily_update", location_id: locationId, queried, price_rows: priceRows, quarantined, discarded },
  });

  return { run_id: runId, mode: "daily_update", location_id: locationId, status: "completed" };
}
