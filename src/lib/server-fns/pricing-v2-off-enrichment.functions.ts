// Pricing v2 — Open Food Facts UPC Enrichment export.
// READ-ONLY enrichment: never mutates pricing_v2_kroger_catalog_raw.
// Caches OFF responses in pricing_v2_product_enrichment_off.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as XLSX from "xlsx";

const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";
const OFF_FIELDS = "code,product_name,brands,categories,quantity,nutriments,ingredients_text";
const CACHE_TTL_DAYS = 30;
const CONCURRENCY = 6;
const MAX_FETCH_PER_RUN = 1500;

type Confidence = "high" | "medium" | "low" | "none";
type OffStatus = "found" | "not_found" | "error";

type EnrichmentRow = {
  upc_normalized: string;
  off_status: OffStatus;
  off_product_name: string | null;
  off_brands: string | null;
  off_categories: string | null;
  off_quantity: string | null;
  nutrition_present: boolean | null;
  ingredients_present: boolean | null;
  enrichment_confidence: Confidence;
  fetched_at: string;
  raw_payload?: any;
};

function normalizeUpc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  // Strip leading zeros but keep at least 8 digits where possible.
  const trimmed = digits.replace(/^0+/, "");
  return trimmed || digits;
}

function scoreConfidence(payload: any, status: OffStatus): Confidence {
  if (status !== "found") return "none";
  const product = payload?.product ?? {};
  const hasCategories = !!String(product.categories ?? "").trim();
  const hasQuantity = !!String(product.quantity ?? "").trim();
  const hasName = !!String(product.product_name ?? "").trim();
  const hasBrand = !!String(product.brands ?? "").trim();
  if (hasCategories && hasQuantity) return "high";
  if (hasName && hasBrand) return "medium";
  return "low";
}

async function fetchOff(barcode: string): Promise<{ status: OffStatus; payload: any | null }> {
  try {
    const url = `${OFF_URL}/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VPSFinest-PricingV2-Enrichment/1.0 (admin export)" },
    });
    if (!res.ok) return { status: "error", payload: null };
    const json: any = await res.json();
    if (json?.status === 1 && json.product) return { status: "found", payload: json };
    return { status: "not_found", payload: json ?? null };
  } catch {
    return { status: "error", payload: null };
  }
}

function toEnrichment(upc: string, status: OffStatus, payload: any): EnrichmentRow {
  const product = payload?.product ?? {};
  const nutriments = product?.nutriments;
  const ingredients = product?.ingredients_text;
  return {
    upc_normalized: upc,
    off_status: status,
    off_product_name: status === "found" ? (product.product_name ?? null) : null,
    off_brands: status === "found" ? (product.brands ?? null) : null,
    off_categories: status === "found" ? (product.categories ?? null) : null,
    off_quantity: status === "found" ? (product.quantity ?? null) : null,
    nutrition_present: status === "found" ? !!(nutriments && Object.keys(nutriments).length) : null,
    ingredients_present: status === "found" ? !!(ingredients && String(ingredients).trim()) : null,
    enrichment_confidence: scoreConfidence(payload, status),
    fetched_at: new Date().toISOString(),
    raw_payload: status === "found" ? product : null,
  };
}

async function pMap<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// --- size_raw light parsing (descriptive only, never used to normalize prices) ---
function extractSizeHints(sizeRaw: string | null | undefined): {
  unit_count: string | null;
  weight: string | null;
  volume: string | null;
} {
  if (!sizeRaw) return { unit_count: null, weight: null, volume: null };
  const s = String(sizeRaw);
  const count = s.match(/(\d+)\s*(?:ct|count|pk|pack|each)\b/i);
  const weight = s.match(/(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg)\b/i);
  const volume = s.match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|ml|l|gal|qt|pt)\b/i);
  return {
    unit_count: count ? `${count[1]} ct` : null,
    weight: weight ? `${weight[1]} ${weight[2]}` : null,
    volume: volume ? `${volume[1]} ${volume[2]}` : null,
  };
}

export const generatePricingV2OffEnrichmentExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = !!(context as any)?.claims?.user_roles?.includes?.("admin")
      || (await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", (context as any).userId)
          .eq("role", "admin")
          .maybeSingle()).data;
    if (!isAdmin) throw new Error("Admin role required");

    // 1. Pull raw Kroger rows (read-only).
    const { data: rawRows, error: rawErr } = await supabaseAdmin
      .from("pricing_v2_kroger_catalog_raw")
      .select("upc, kroger_product_id, name, brand, size_raw, payload_json, run_id")
      .limit(20000);
    if (rawErr) throw new Error(`Failed to read raw catalog: ${rawErr.message}`);

    // Map run_id -> keyword (best-effort, optional).
    const runIds = Array.from(new Set((rawRows ?? []).map((r: any) => r.run_id).filter(Boolean)));
    let runKeyword = new Map<string, string>();
    if (runIds.length) {
      const { data: runs } = await supabaseAdmin
        .from("pricing_v2_runs")
        .select("run_id, keyword")
        .in("run_id", runIds as string[]);
      for (const r of runs ?? []) {
        if ((r as any).run_id) runKeyword.set((r as any).run_id, (r as any).keyword ?? "");
      }
    }

    // 2. Build deduped UPC list.
    const upcSet = new Map<string, string>(); // normalized -> first seen raw upc
    for (const r of rawRows ?? []) {
      const norm = normalizeUpc((r as any).upc);
      if (norm && !upcSet.has(norm)) upcSet.set(norm, (r as any).upc);
    }
    const allUpcs = Array.from(upcSet.keys());

    // 3. Load cached enrichment.
    const cacheCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString();
    const cache = new Map<string, EnrichmentRow>();
    const CHUNK = 500;
    for (let i = 0; i < allUpcs.length; i += CHUNK) {
      const slice = allUpcs.slice(i, i + CHUNK);
      const { data } = await supabaseAdmin
        .from("pricing_v2_product_enrichment_off")
        .select("*")
        .in("upc_normalized", slice)
        .gte("fetched_at", cacheCutoff);
      for (const row of (data ?? []) as any[]) cache.set(row.upc_normalized, row as EnrichmentRow);
    }

    // 4. Fetch missing from OFF (capped to avoid runaway).
    const toFetch = allUpcs.filter((u) => !cache.has(u)).slice(0, MAX_FETCH_PER_RUN);
    const fetched = await pMap(toFetch, CONCURRENCY, async (upc) => {
      const { status, payload } = await fetchOff(upc);
      return toEnrichment(upc, status, payload);
    });

    // 5. Persist new results (upsert).
    if (fetched.length) {
      const insertable = fetched.map((r) => ({
        upc_normalized: r.upc_normalized,
        off_status: r.off_status,
        off_product_name: r.off_product_name,
        off_brands: r.off_brands,
        off_categories: r.off_categories,
        off_quantity: r.off_quantity,
        nutrition_present: r.nutrition_present,
        ingredients_present: r.ingredients_present,
        enrichment_confidence: r.enrichment_confidence,
        raw_payload: r.raw_payload ?? null,
        fetched_at: r.fetched_at,
      }));
      for (let i = 0; i < insertable.length; i += 200) {
        const batch = insertable.slice(i, i + 200);
        const { error: upErr } = await supabaseAdmin
          .from("pricing_v2_product_enrichment_off")
          .upsert(batch, { onConflict: "upc_normalized" });
        if (upErr) console.error("OFF upsert error:", upErr.message);
      }
      for (const r of fetched) cache.set(r.upc_normalized, r);
    }

    // 6. Build Sheet 1 — Kroger raw + OFF side-by-side.
    const sheet1Rows = (rawRows ?? []).map((r: any) => {
      const norm = normalizeUpc(r.upc);
      const off = norm ? cache.get(norm) : undefined;
      const hints = extractSizeHints(r.size_raw);
      return {
        upc: r.upc ?? "",
        upc_normalized: norm ?? "",
        kroger_product_id: r.kroger_product_id,
        product_name: r.name ?? "",
        brand: r.brand ?? "",
        size_raw: r.size_raw ?? "",
        unit_count: hints.unit_count ?? "",
        weight: hints.weight ?? "",
        volume: hints.volume ?? "",
        keyword_category: runKeyword.get(r.run_id) ?? "",
        // OFF enrichment columns
        off_product_name: off?.off_product_name ?? "",
        off_brands: off?.off_brands ?? "",
        off_categories: off?.off_categories ?? "",
        off_quantity: off?.off_quantity ?? "",
        off_status: off?.off_status ?? "not_evaluated",
        enrichment_confidence: off?.enrichment_confidence ?? "none",
      };
    });

    // 7. Sheet 2 — coverage summary.
    const totalUpcs = allUpcs.length;
    let found = 0, notFound = 0, error = 0;
    const confDist: Record<Confidence, number> = { high: 0, medium: 0, low: 0, none: 0 };
    for (const u of allUpcs) {
      const e = cache.get(u);
      if (!e) { error++; confDist.none++; continue; }
      if (e.off_status === "found") found++;
      else if (e.off_status === "not_found") notFound++;
      else error++;
      confDist[e.enrichment_confidence]++;
    }
    const pct = (n: number) => totalUpcs ? `${((n / totalUpcs) * 100).toFixed(1)}%` : "0.0%";

    // Coverage by Kroger keyword/category.
    const byCat = new Map<string, { total: number; found: number }>();
    for (const r of rawRows ?? []) {
      const cat = runKeyword.get((r as any).run_id) || "(uncategorized)";
      const norm = normalizeUpc((r as any).upc);
      const off = norm ? cache.get(norm) : undefined;
      const cur = byCat.get(cat) ?? { total: 0, found: 0 };
      cur.total++;
      if (off?.off_status === "found") cur.found++;
      byCat.set(cat, cur);
    }
    const coverageByCategory = Array.from(byCat.entries())
      .map(([category, v]) => ({
        category,
        kroger_records: v.total,
        off_found: v.found,
        coverage_pct: v.total ? `${((v.found / v.total) * 100).toFixed(1)}%` : "0.0%",
      }))
      .sort((a, b) => b.kroger_records - a.kroger_records);

    const sheet2Rows = [
      { metric: "Total Kroger raw rows", value: rawRows?.length ?? 0 },
      { metric: "Distinct normalized UPCs evaluated", value: totalUpcs },
      { metric: "Found in OFF", value: `${found} (${pct(found)})` },
      { metric: "Not found in OFF", value: `${notFound} (${pct(notFound)})` },
      { metric: "Errors / not yet fetched", value: `${error} (${pct(error)})` },
      { metric: "", value: "" },
      { metric: "Confidence: high", value: `${confDist.high} (${pct(confDist.high)})` },
      { metric: "Confidence: medium", value: `${confDist.medium} (${pct(confDist.medium)})` },
      { metric: "Confidence: low", value: `${confDist.low} (${pct(confDist.low)})` },
      { metric: "Confidence: none", value: `${confDist.none} (${pct(confDist.none)})` },
      { metric: "", value: "" },
      { metric: "Newly fetched this run", value: fetched.length },
      { metric: "Cache TTL (days)", value: CACHE_TTL_DAYS },
      { metric: "Generated at", value: new Date().toISOString() },
    ];

    // 8. Sheet 3 — Notes.
    const sheet3Rows = [
      { note: "Open Food Facts is ENRICHMENT, not truth." },
      { note: "Kroger remains the pricing authority. OFF data is descriptive only." },
      { note: "No normalization, unit conversion, or pricing decision is performed." },
      { note: "Confidence scoring is descriptive — it does NOT enable normalization automatically." },
      { note: "OFF responses are cached for 30 days in pricing_v2_product_enrichment_off." },
      { note: "Re-running the export refreshes any UPCs whose cache has expired (capped per run)." },
      { note: "Raw Kroger ingestion is read-only and never mutated by this export." },
    ];

    // 9. Build XLSX.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1Rows), "Kroger + OFF");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      ...sheet2Rows,
      { metric: "", value: "" },
      { metric: "── Coverage by Kroger keyword/category ──", value: "" },
      ...coverageByCategory.map((c) => ({
        metric: c.category,
        value: `${c.off_found}/${c.kroger_records} (${c.coverage_pct})`,
      })),
    ]), "OFF Coverage Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet3Rows), "Notes");

    const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

    return {
      base64: buf,
      filename: `pricing_v2_off_enrichment_${new Date().toISOString().slice(0, 10)}.xlsx`,
      summary: {
        total_raw_rows: rawRows?.length ?? 0,
        total_upcs: totalUpcs,
        found,
        not_found: notFound,
        errors: error,
        confidence: confDist,
        newly_fetched: fetched.length,
        last_run_at: new Date().toISOString(),
      },
    };
  });
