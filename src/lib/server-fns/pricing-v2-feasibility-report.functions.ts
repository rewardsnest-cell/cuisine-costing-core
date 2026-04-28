// Pricing v2 — Data Feasibility & Rule Design report.
//
// READ-ONLY analysis of pricing_v2_kroger_catalog_raw to determine what
// percentage of the raw Kroger dataset can be safely normalized, broken down
// by representation type, keyword category, feasibility tier, and ambiguity
// signals. Performs NO writes, NO conversions, NO totals, NO normalization.
//
// Output: structured JSON + human-readable Markdown report.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------------------------------------------------------

type RawRow = {
  id: string;
  run_id: string | null;
  name: string;
  brand: string | null;
  size_raw: string | null;
  fetched_at: string;
};

type RunRow = {
  run_id: string;
  params: any;
};

type KeywordRow = {
  keyword: string;
  category: string | null;
};

type Representation =
  | "weight_only"
  | "count_only"
  | "count_and_weight"
  | "volume"
  | "ambiguous";

type Tier = "tier_1" | "tier_2" | "tier_3" | "tier_4" | "tier_5";

type ParsedSize = {
  weight_value: number | null;
  weight_unit: string | null;
  unit_count: number | null;
  volume_value: number | null;
  volume_unit: string | null;
  ambiguous: boolean;
  parsed_success: boolean;
};

// ---------- Read-only size_raw classifier ---------------------------------
// NOTE: This does NOT compute grams, totals, or convert anything. It only
// extracts presence/absence of weight, count, and volume tokens to bucket
// each record into a representation type. This matches the spec column names
// (unit_count, weight_value, weight_unit, volume_value, volume_unit,
// ambiguous_flag, parsed_success_flag) without persisting them.

const WEIGHT_UNITS = new Set([
  "oz", "ounce", "ounces",
  "lb", "lbs", "pound", "pounds",
  "g", "gram", "grams",
  "kg", "kilogram", "kilograms",
  "mg",
]);

const VOLUME_UNITS = new Set([
  "fl oz", "floz", "fluid ounce", "fluid ounces",
  "ml", "milliliter", "milliliters",
  "l", "liter", "liters", "litre", "litres",
  "gal", "gallon", "gallons",
  "qt", "quart", "quarts",
  "pt", "pint", "pints",
  "cup", "cups",
  "tsp", "tbsp",
]);

const COUNT_TOKENS = new Set([
  "ct", "count", "counts",
  "pk", "pack", "packs",
  "ea", "each",
  "pc", "pcs", "piece", "pieces",
]);

function parseSizeRaw(raw: string | null | undefined): ParsedSize {
  const empty: ParsedSize = {
    weight_value: null, weight_unit: null,
    unit_count: null,
    volume_value: null, volume_unit: null,
    ambiguous: true, parsed_success: false,
  };
  if (!raw) return empty;
  const s = String(raw).trim().toLowerCase();
  if (!s) return empty;

  const out: ParsedSize = {
    weight_value: null, weight_unit: null,
    unit_count: null,
    volume_value: null, volume_unit: null,
    ambiguous: false, parsed_success: false,
  };

  // Match all "<number> <unit>" pairs and "<number> x <number> <unit>" combos.
  // Examples: "16 oz", "12 ct", "6 pk 12 fl oz", "2 lb", "1 gal", "12x12 oz".
  // We don't compute totals — just record presence.
  const pairRegex = /(\d+(?:\.\d+)?)\s*(fl\s*oz|fluid\s*ounces?|[a-z]+)/g;
  let m: RegExpExecArray | null;
  let matched = 0;
  while ((m = pairRegex.exec(s)) !== null) {
    matched++;
    const value = parseFloat(m[1]);
    const unitRaw = m[2].replace(/\s+/g, " ").trim();
    const unit = unitRaw === "floz" ? "fl oz" : unitRaw;

    if (WEIGHT_UNITS.has(unit)) {
      if (out.weight_value == null) {
        out.weight_value = value;
        out.weight_unit = unit;
      }
    } else if (VOLUME_UNITS.has(unit) || unit === "fl oz") {
      if (out.volume_value == null) {
        out.volume_value = value;
        out.volume_unit = unit;
      }
    } else if (COUNT_TOKENS.has(unit)) {
      if (out.unit_count == null) {
        out.unit_count = Math.round(value);
      }
    }
  }

  // Detect "NxM" multi-pack notation (e.g. "6 x 12 fl oz", "12x16.9 fl oz")
  const multi = /(\d+)\s*x\s*\d/.exec(s);
  if (multi && out.unit_count == null) {
    out.unit_count = parseInt(multi[1], 10);
  }

  out.parsed_success =
    out.weight_value != null || out.unit_count != null || out.volume_value != null;
  out.ambiguous = !out.parsed_success || matched === 0;
  return out;
}

function representation(p: ParsedSize): Representation {
  if (p.ambiguous || !p.parsed_success) return "ambiguous";
  if (p.volume_value != null && p.weight_value == null && p.unit_count == null) return "volume";
  if (p.volume_value != null) return "volume";
  if (p.weight_value != null && p.unit_count == null) return "weight_only";
  if (p.weight_value == null && p.unit_count != null) return "count_only";
  if (p.weight_value != null && p.unit_count != null) return "count_and_weight";
  return "ambiguous";
}

function tier(p: ParsedSize): Tier {
  // Tier 1: explicit weight-only — high confidence
  // Tier 2: count + weight — needs interpretation
  // Tier 3: count-only — needs external mapping or block
  // Tier 4: volume — needs density rules
  // Tier 5: ambiguous
  if (p.ambiguous || !p.parsed_success) return "tier_5";
  if (p.weight_value != null && p.unit_count == null && p.volume_value == null) return "tier_1";
  if (p.weight_value != null && p.unit_count != null && p.volume_value == null) return "tier_2";
  if (p.weight_value == null && p.unit_count != null && p.volume_value == null) return "tier_3";
  if (p.volume_value != null) return "tier_4";
  return "tier_5";
}

// ---------- Aggregation helpers -------------------------------------------

type Buckets = Record<Representation, number>;
type TierBuckets = Record<Tier, number>;

function emptyBuckets(): Buckets {
  return {
    weight_only: 0, count_only: 0, count_and_weight: 0,
    volume: 0, ambiguous: 0,
  };
}
function emptyTiers(): TierBuckets {
  return { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0, tier_5: 0 };
}

function pct(n: number, total: number): string {
  if (!total) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

// Build a category index from the keyword library and run params.
// For each row, attribute a category by checking if its product name OR
// run keywords contain a known keyword from the library.
function buildCategoryAttribution(
  rows: RawRow[],
  runs: RunRow[],
  keywords: KeywordRow[],
): Map<string, string> {
  const runIdToCategory = new Map<string, string>();
  const lib = keywords.map((k) => ({
    keyword: k.keyword.toLowerCase(),
    category: k.category || "uncategorized",
  }));

  // First pass: map each run to its dominant category by checking run.params.keywords
  for (const r of runs) {
    const kws: string[] = Array.isArray(r.params?.keywords)
      ? r.params.keywords.map((x: any) => String(x).toLowerCase())
      : r.params?.keyword
      ? [String(r.params.keyword).toLowerCase()]
      : [];
    if (kws.length === 0) continue;
    const catCounts = new Map<string, number>();
    for (const kw of kws) {
      const hit = lib.find((l) => l.keyword === kw);
      if (hit) catCounts.set(hit.category, (catCounts.get(hit.category) || 0) + 1);
    }
    if (catCounts.size > 0) {
      const top = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      runIdToCategory.set(r.run_id, top);
    }
  }

  // Per-row attribution: prefer name match, fall back to run-level category.
  const rowToCategory = new Map<string, string>();
  for (const row of rows) {
    const name = (row.name || "").toLowerCase();
    let category: string | null = null;
    for (const l of lib) {
      // word-boundary match to avoid spurious hits
      const re = new RegExp(`\\b${l.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(name)) {
        category = l.category;
        break;
      }
    }
    if (!category && row.run_id && runIdToCategory.has(row.run_id)) {
      category = runIdToCategory.get(row.run_id)!;
    }
    rowToCategory.set(row.id, category || "uncategorized");
  }
  return rowToCategory;
}

// ---------- Markdown rendering --------------------------------------------

function renderBucketsTable(b: Buckets, total: number): string {
  return [
    "| Representation | Count | % |",
    "|---|---:|---:|",
    `| Weight-only | ${b.weight_only} | ${pct(b.weight_only, total)} |`,
    `| Count-only | ${b.count_only} | ${pct(b.count_only, total)} |`,
    `| Count + weight | ${b.count_and_weight} | ${pct(b.count_and_weight, total)} |`,
    `| Volume-based | ${b.volume} | ${pct(b.volume, total)} |`,
    `| Ambiguous / non-quantifiable | ${b.ambiguous} | ${pct(b.ambiguous, total)} |`,
  ].join("\n");
}

function renderTierTable(t: TierBuckets, total: number): string {
  return [
    "| Tier | Description | Count | % |",
    "|---|---|---:|---:|",
    `| 1 | Explicit weight-only (high confidence) | ${t.tier_1} | ${pct(t.tier_1, total)} |`,
    `| 2 | Count + weight (interpretation rules) | ${t.tier_2} | ${pct(t.tier_2, total)} |`,
    `| 3 | Count-only (external mapping or block) | ${t.tier_3} | ${pct(t.tier_3, total)} |`,
    `| 4 | Volume-based (density rules) | ${t.tier_4} | ${pct(t.tier_4, total)} |`,
    `| 5 | Ambiguous (likely block) | ${t.tier_5} | ${pct(t.tier_5, total)} |`,
  ].join("\n");
}

// ---------- Server function -----------------------------------------------

export const generatePricingV2FeasibilityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;

    // 1) Load all raw rows (paged, read-only)
    const PAGE = 1000;
    const rows: RawRow[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pricing_v2_kroger_catalog_raw")
        .select("id, run_id, name, brand, size_raw, fetched_at, kroger_product_id")
        .order("fetched_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to read raw catalog: ${error.message}`);
      const batch = (data ?? []) as any[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    // 2) Load runs referenced by these rows (for keyword/category attribution)
    const runIds = Array.from(new Set(rows.map((r) => r.run_id).filter(Boolean))) as string[];
    const runs: RunRow[] = [];
    if (runIds.length > 0) {
      // chunk to avoid query length issues
      const CHUNK = 200;
      for (let i = 0; i < runIds.length; i += CHUNK) {
        const slice = runIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("pricing_v2_runs")
          .select("run_id, params")
          .in("run_id", slice);
        if (!error && data) runs.push(...(data as any[]));
      }
    }

    // 3) Load keyword library for category mapping
    const { data: kwData } = await supabase
      .from("pricing_v2_keyword_library")
      .select("keyword, category");
    const keywords = (kwData ?? []) as KeywordRow[];

    const total = rows.length;
    const uniqueProducts = new Set(rows.map((r: any) => r.kroger_product_id)).size;
    const distinctRunKeywords = new Set<string>();
    for (const run of runs) {
      const kws: string[] = Array.isArray(run.params?.keywords) ? run.params.keywords : [];
      for (const k of kws) distinctRunKeywords.add(String(k).toLowerCase());
      if (run.params?.keyword) distinctRunKeywords.add(String(run.params.keyword).toLowerCase());
    }
    const dateMin = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.fetched_at < acc ? r.fetched_at : acc),
      null,
    );
    const dateMax = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.fetched_at > acc ? r.fetched_at : acc),
      null,
    );

    // 4) Classify every row
    const overallReps = emptyBuckets();
    const overallTiers = emptyTiers();
    const byCategoryReps = new Map<string, Buckets>();
    const byCategoryTiers = new Map<string, TierBuckets>();
    const byCategoryTotal = new Map<string, number>();
    const unparseableSamples = new Map<string, number>();

    const rowCategory = buildCategoryAttribution(rows, runs, keywords);

    for (const row of rows) {
      const parsed = parseSizeRaw(row.size_raw);
      const rep = representation(parsed);
      const tr = tier(parsed);

      overallReps[rep]++;
      overallTiers[tr]++;

      const cat = rowCategory.get(row.id) || "uncategorized";
      if (!byCategoryReps.has(cat)) {
        byCategoryReps.set(cat, emptyBuckets());
        byCategoryTiers.set(cat, emptyTiers());
        byCategoryTotal.set(cat, 0);
      }
      byCategoryReps.get(cat)![rep]++;
      byCategoryTiers.get(cat)![tr]++;
      byCategoryTotal.set(cat, (byCategoryTotal.get(cat) || 0) + 1);

      if (parsed.ambiguous && row.size_raw) {
        const key = String(row.size_raw).trim().toLowerCase();
        if (key) unparseableSamples.set(key, (unparseableSamples.get(key) || 0) + 1);
      } else if (!row.size_raw) {
        unparseableSamples.set("(empty / null)", (unparseableSamples.get("(empty / null)") || 0) + 1);
      }
    }

    const topUnparseable = [...unparseableSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

    // ---- Markdown report ----
    const now = new Date().toISOString();
    const lines: string[] = [];
    lines.push("# Pricing v2 — Data Feasibility & Rule Design");
    lines.push("");
    lines.push(`_Generated: ${now}_`);
    lines.push("");
    lines.push("> **Read-only analysis.** No normalization, no conversions, no totals, no pricing decisions applied. Source: `pricing_v2_kroger_catalog_raw`.");
    lines.push("");

    lines.push("## 1. Dataset Overview");
    lines.push("");
    lines.push(`- **Total raw products analyzed:** ${total.toLocaleString()}`);
    lines.push(`- **Unique product identifiers:** ${uniqueProducts.toLocaleString()}`);
    lines.push(`- **Date range of \`fetched_at\`:** ${dateMin ?? "—"} → ${dateMax ?? "—"}`);
    lines.push(`- **Distinct keywords contributing data:** ${distinctRunKeywords.size.toLocaleString()}`);
    lines.push("");

    lines.push("## 2. Size / Quantity Representation Breakdown");
    lines.push("");
    lines.push(renderBucketsTable(overallReps, total));
    lines.push("");

    lines.push("## 3. Breakdown by Keyword Category");
    lines.push("");
    if (byCategoryReps.size === 0) {
      lines.push("_No keyword categories available._");
    } else {
      const cats = [...byCategoryTotal.entries()].sort((a, b) => b[1] - a[1]);
      for (const [cat, catTotal] of cats) {
        lines.push(`### ${cat} _(n=${catTotal})_`);
        lines.push("");
        lines.push(renderBucketsTable(byCategoryReps.get(cat)!, catTotal));
        lines.push("");
      }
    }

    lines.push("## 4. Normalization Feasibility Tiers");
    lines.push("");
    lines.push("> Descriptive classification only — no normalization performed.");
    lines.push("");
    lines.push(renderTierTable(overallTiers, total));
    lines.push("");
    if (byCategoryTiers.size > 0) {
      lines.push("### Tiers by Category");
      lines.push("");
      const cats = [...byCategoryTotal.entries()].sort((a, b) => b[1] - a[1]);
      for (const [cat, catTotal] of cats) {
        lines.push(`#### ${cat} _(n=${catTotal})_`);
        lines.push("");
        lines.push(renderTierTable(byCategoryTiers.get(cat)!, catTotal));
        lines.push("");
      }
    }

    lines.push("## 5. Risk & Ambiguity Signals");
    lines.push("");
    lines.push(`- **Ambiguous share of catalog:** ${pct(overallReps.ambiguous, total)} (${overallReps.ambiguous.toLocaleString()} of ${total.toLocaleString()})`);
    lines.push("");
    lines.push("**Top unparseable / ambiguous size strings (by frequency):**");
    lines.push("");
    if (topUnparseable.length === 0) {
      lines.push("_None observed._");
    } else {
      lines.push("| Size string | Occurrences |");
      lines.push("|---|---:|");
      for (const [k, v] of topUnparseable) {
        lines.push(`| \`${k.replace(/\|/g, "\\|")}\` | ${v} |`);
      }
    }
    lines.push("");
    lines.push("**Common parsing breakers observed:**");
    lines.push("");
    lines.push("- Marketing terms appearing in `size_raw` (e.g. _family size_, _value pack_) without numeric units");
    lines.push("- Missing units (numeric value with no `oz`/`lb`/`ct`/`fl oz`)");
    lines.push("- Empty / null `size_raw`");
    lines.push("- Multi-pack notation (`6 x 12 fl oz`) — recorded but not totalled here");
    lines.push("");

    lines.push("## 6. Export Metadata");
    lines.push("");
    lines.push(`- **Run timestamp:** ${now}`);
    lines.push(`- **Filters applied:** none (full table scan)`);
    lines.push(`- **Source table:** \`pricing_v2_kroger_catalog_raw\``);
    lines.push(`- **Reminder:** No normalization or pricing applied. This report is analytical, not operational.`);
    lines.push("");

    const markdown = lines.join("\n");
    const filename = `pricing_v2_feasibility_${now.split("T")[0]}.md`;

    return {
      filename,
      markdown,
      summary: {
        total,
        unique_products: uniqueProducts,
        date_range: { min: dateMin, max: dateMax },
        distinct_keywords: distinctRunKeywords.size,
        representation: overallReps,
        tiers: overallTiers,
        ambiguous_pct: pct(overallReps.ambiguous, total),
        categories: [...byCategoryTotal.entries()].map(([cat, n]) => ({
          category: cat,
          total: n,
          representation: byCategoryReps.get(cat)!,
          tiers: byCategoryTiers.get(cat)!,
        })),
        top_unparseable: topUnparseable.map(([value, count]) => ({ value, count })),
      },
    };
  });
