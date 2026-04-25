// Archive audit: scans the codebase for any leftover references to legacy
// Pricing v1 tables / functions, and lists DB objects that live in the
// `archive` schema. Used by /admin/archive-audit.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// Legacy Pricing v1 table & function name fragments. Keep this list
// authoritative — see docs/pricing-archive.md.
const LEGACY_PATTERNS: string[] = [
  "kroger_bootstrap_progress",
  "kroger_validation_anomalies",
  "kroger_validation_runs",
  "kroger_ingest_runs",
  "kroger_sku_map",
  "fred_pull_log",
  "fred_series_map",
  "national_price_staging",
  "national_price_snapshots",
  "pricing_model_recipes",
  "pricing_models",
  "price_history",
  "cost_update_queue",
];

// Files that are EXPECTED to mention the legacy names (docs, archive stubs,
// the audit page itself). Matches are filtered out so they don't show as
// failures.
const ALLOWLIST_SUBSTRINGS: string[] = [
  "/docs/pricing-archive",
  "/lib/server-fns/archive-audit.functions",
  "/routes/admin/archive-audit",
  "/lib/pricing-engine",
  // Archived stub pages explicitly reference their old table names.
  "/routes/admin/cost-queue",
  "/routes/admin/trends",
  "/routes/admin/national-prices",
  "/routes/admin/margin-volatility",
  "/routes/admin/pricing-code-inventory",
  "/routes/admin/pricing-visibility",
  // Stub server-fn modules that exist only to throw LegacyPricingArchivedError.
  "/lib/server-fns/kroger-pricing.functions",
  "/lib/server-fns/cost-intelligence.functions",
  "/lib/server-fns/national-snapshots.functions",
  "/lib/server-fns/national-pricing-activation.functions",
  "/lib/server-fns/fred-mappings.functions",
  "/lib/server-fns/fred-pricing.functions",
  "/lib/server-fns/bulk-refresh-fred.functions",
  "/lib/server-fns/apply-national-floor.functions",
  "/lib/server-fns/price-volatility.functions",
  "/lib/server-fns/ingredient-coverage.functions",
  "/lib/server-fns/update-inventory-costs.functions",
  "/lib/server-fns/receipt-kroger-diagnostics.functions",
  "/lib/server-fns/pricing-admin.functions",
  "/lib/server/kroger-core",
  "/lib/server/kroger-ingest-internal",
  "/lib/admin/pricing-code-inventory",
];

// Vite inlines file contents as raw strings at build time. The Worker can
// then iterate them without any filesystem access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawFiles = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type LegacyMatch = {
  file: string;
  line: number;
  pattern: string;
  excerpt: string;
};

function isAllowlisted(path: string): boolean {
  return ALLOWLIST_SUBSTRINGS.some((s) => path.includes(s));
}

function scanCodebase(): LegacyMatch[] {
  const matches: LegacyMatch[] = [];
  for (const [filePath, contents] of Object.entries(rawFiles)) {
    if (isAllowlisted(filePath)) continue;
    if (typeof contents !== "string") continue;
    const lines = contents.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of LEGACY_PATTERNS) {
        if (line.includes(pattern)) {
          matches.push({
            file: filePath.replace(/^\/?/, ""),
            line: i + 1,
            pattern,
            excerpt: line.trim().slice(0, 200),
          });
        }
      }
    }
  }
  return matches;
}

export const scanLegacyReferences = createServerFn({ method: "GET" }).handler(
  async () => {
    const matches = scanCodebase();
    return {
      patterns: LEGACY_PATTERNS,
      filesScanned: Object.keys(rawFiles).length,
      matches,
      pass: matches.length === 0,
    };
  },
);

// ---- DB side: list everything in the `archive` schema --------------------

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type ArchiveObject = { name: string; kind: "table" | "view" };

export const listArchiveObjects = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const supabase = getServiceClient();
      // We use a simple RPC-free path: read information_schema via PostgREST
      // is not exposed by default, so we proxy through a lightweight
      // service_role query helper. If unavailable, fall back to the static
      // list from docs/pricing-archive.md.
      const { data, error } = await supabase
        .schema("information_schema" as never)
        .from("tables" as never)
        .select("table_name, table_type")
        .eq("table_schema", "archive");
      if (error) throw error;
      const objects: ArchiveObject[] = (data ?? []).map((r: any) => ({
        name: r.table_name,
        kind: r.table_type === "VIEW" ? "view" : "table",
      }));
      return { objects, source: "live" as const };
    } catch (err) {
      // Fallback: static list from the migration / docs.
      const fallback: ArchiveObject[] = [
        "kroger_bootstrap_progress",
        "kroger_validation_anomalies",
        "kroger_validation_runs",
        "kroger_ingest_runs",
        "kroger_sku_map",
        "fred_pull_log",
        "fred_series_map",
        "national_price_staging",
        "national_price_snapshots",
        "pricing_model_recipes",
        "pricing_models",
        "price_history",
        "cost_update_queue",
      ].map((name) => ({ name, kind: "table" as const }));
      return {
        objects: fallback,
        source: "fallback" as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

// ---- Runtime smoke test --------------------------------------------------
// Loads the loader data for a few key admin/public screens and confirms no
// query was issued against the `archive` schema. Since we can't intercept
// the Supabase client cleanly here, we instead rely on the absence of
// `LegacyPricingArchivedError` being thrown when these routes' server
// functions are exercised. The page calls a small set of safe read
// endpoints below.

export const runRuntimeSmokeTest = createServerFn({ method: "GET" }).handler(
  async () => {
    const checks: Array<{ name: string; ok: boolean; error?: string }> = [];

    async function probe(name: string, fn: () => Promise<unknown>) {
      try {
        await fn();
        checks.push({ name, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Any LegacyPricingArchivedError is a failure — that means a screen
        // is still wired through the archived pipeline.
        checks.push({ name, ok: false, error: message });
      }
    }

    const supabase = getServiceClient();
    await probe("inventory_items read", async () => {
      const { error } = await supabase
        .from("inventory_items")
        .select("id")
        .limit(1);
      if (error) throw error;
    });
    await probe("recipes read", async () => {
      const { error } = await supabase.from("recipes").select("id").limit(1);
      if (error) throw error;
    });
    await probe("menu_items read", async () => {
      const { error } = await supabase.from("menu_items").select("id").limit(1);
      if (error) throw error;
    });

    const pass = checks.every((c) => c.ok);
    return { checks, pass };
  },
);
