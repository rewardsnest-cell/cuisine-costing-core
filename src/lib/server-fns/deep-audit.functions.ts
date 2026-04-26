// Deep Audit — collects a live snapshot of the app (DB schema, RLS, server
// functions, routes, integrations, recent error log counts) and prepends the
// MEGA_AUDIT_PROMPT so the result is a copy-paste-ready audit brief.
//
// Admin-only. Returns plain text/markdown. No secrets are emitted.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MEGA_AUDIT_PROMPT } from "@/lib/admin/mega-audit-prompt";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Auth check failed");
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

// ---- Snapshot collectors --------------------------------------------------

async function collectSchema() {
  // information_schema.columns is exposed via PostgREST schema swap.
  const { data, error } = await supabaseAdmin
    .schema("information_schema" as never)
    .from("columns" as never)
    .select("table_name, column_name, data_type, is_nullable")
    .eq("table_schema", "public")
    .order("table_name" as any)
    .order("ordinal_position" as any);
  if (error) return `(schema unavailable: ${error.message})`;
  const rows = (data ?? []) as Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>;
  const byTable = new Map<string, string[]>();
  for (const r of rows) {
    const t = byTable.get(r.table_name) ?? [];
    t.push(`  - ${r.column_name}: ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}`);
    byTable.set(r.table_name, t);
  }
  const tables = Array.from(byTable.keys()).sort();
  return tables.length === 0
    ? "(no public tables found)"
    : tables.map((t) => `${t}\n${byTable.get(t)!.join("\n")}`).join("\n\n");
}

async function collectRls() {
  const [{ data: tables, error: e1 }, { data: policies, error: e2 }] = await Promise.all([
    supabaseAdmin.rpc("audit_list_tables_with_rls" as any),
    supabaseAdmin.rpc("audit_list_rls_policies" as any),
  ]);
  if (e1) return `(RLS table list unavailable: ${e1.message})`;
  if (e2) return `(RLS policies unavailable: ${e2.message})`;

  const tRows = (tables ?? []) as Array<{
    table_name: string;
    rls_enabled: boolean;
    policy_count: number;
  }>;
  const pRows = (policies ?? []) as Array<{
    tablename: string;
    policyname: string;
    cmd: string;
    permissive: string;
    roles: string[] | null;
    qual: string | null;
    with_check: string | null;
  }>;

  const policiesByTable = new Map<string, typeof pRows>();
  for (const p of pRows) {
    const arr = policiesByTable.get(p.tablename) ?? [];
    arr.push(p);
    policiesByTable.set(p.tablename, arr);
  }

  const lines: string[] = [];
  for (const t of tRows) {
    const flag = t.rls_enabled ? "RLS=on" : "RLS=OFF";
    const ps = policiesByTable.get(t.table_name) ?? [];
    lines.push(`### ${t.table_name}  (${flag}, ${ps.length} polic${ps.length === 1 ? "y" : "ies"})`);
    if (!t.rls_enabled && ps.length > 0) {
      lines.push("  ⚠️ Policies exist but RLS is DISABLED — policies are not enforced.");
    }
    if (t.rls_enabled && ps.length === 0) {
      lines.push("  ⚠️ RLS enabled but NO policies — table is unreadable for non-admin clients.");
    }
    for (const p of ps) {
      lines.push(
        `  - [${p.cmd}] ${p.policyname}` +
          (p.roles?.length ? ` roles=${p.roles.join(",")}` : "") +
          (p.qual ? `\n      USING: ${p.qual}` : "") +
          (p.with_check ? `\n      WITH CHECK: ${p.with_check}` : ""),
      );
    }
  }
  return lines.join("\n");
}

async function collectErrorLogSummary() {
  const sections: string[] = [];

  // pricing_v2_errors
  try {
    const { data, error } = await supabaseAdmin
      .from("pricing_v2_errors")
      .select("severity, type")
      .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString())
      .limit(5000);
    if (error) {
      sections.push(`pricing_v2_errors: (unavailable — ${error.message})`);
    } else {
      const rows = (data ?? []) as Array<{ severity: string | null; type: string | null }>;
      const counts = new Map<string, number>();
      for (const r of rows) {
        const k = `${r.severity ?? "unknown"}:${r.type ?? "unknown"}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25);
      sections.push(
        `pricing_v2_errors (last 7d, total=${rows.length}):\n` +
          (top.length === 0
            ? "  (none)"
            : top.map(([k, n]) => `  - ${n.toString().padStart(5)} × ${k}`).join("\n")),
      );
    }
  } catch (e) {
    sections.push(`pricing_v2_errors: (failed — ${e instanceof Error ? e.message : String(e)})`);
  }

  return sections.join("\n\n");
}

async function collectIntegrationStatus() {
  // Read from existing integrations status if available; otherwise enumerate
  // env-var presence (names only, never values).
  const envChecks = [
    "KROGER_CLIENT_ID",
    "KROGER_CLIENT_SECRET",
    "FRED_API_KEY",
    "FLIPP_API_KEY",
    "LOVABLE_API_KEY",
    "RESEND_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
  ];
  const lines = envChecks.map((name) => {
    const present = Boolean(process.env[name] && String(process.env[name]).length > 0);
    return `  - ${name}: ${present ? "configured" : "MISSING"}`;
  });
  return [
    "Backend: Supabase (Postgres + Auth + Storage)",
    "AI: Lovable AI Gateway (server-side)",
    "External data sources: Kroger Catalog & Pricing, FRED, Flipp",
    "Email: Resend (transactional)",
    "",
    "Configured server secrets (names only, no values):",
    ...lines,
  ].join("\n");
}

// ---- Source-tree introspection (server fns + routes) ---------------------
//
// Server functions and routes are statically known files in the repo. We can
// safely embed their inventory at build time via Vite's import.meta.glob,
// which evaluates at compile time on the server bundle.

function collectServerFns(): string {
  // eager: false, query: '?raw' — read filenames only, no content.
  const fnGlob = (import.meta as any).glob?.("/src/lib/server-fns/*.functions.ts", {
    eager: false,
  }) as Record<string, unknown> | undefined;
  const files = fnGlob ? Object.keys(fnGlob).sort() : [];
  return files.length === 0
    ? "(server function inventory unavailable in this runtime)"
    : files.map((f) => `  - ${f.replace("/src/lib/server-fns/", "")}`).join("\n");
}

function collectRoutes(): string {
  const routeGlob = (import.meta as any).glob?.("/src/routes/**/*.tsx", {
    eager: false,
  }) as Record<string, unknown> | undefined;
  const files = routeGlob ? Object.keys(routeGlob).sort() : [];
  if (files.length === 0) return "(route inventory unavailable in this runtime)";
  const buckets: Record<string, string[]> = { admin: [], employee: [], public: [] };
  for (const f of files) {
    const rel = f.replace("/src/routes/", "");
    if (rel.startsWith("admin/")) buckets.admin.push(rel);
    else if (rel.startsWith("employee/")) buckets.employee.push(rel);
    else buckets.public.push(rel);
  }
  return [
    `Public routes (${buckets.public.length}):`,
    ...buckets.public.map((r) => `  - ${r}`),
    "",
    `Employee routes (${buckets.employee.length}):`,
    ...buckets.employee.map((r) => `  - ${r}`),
    "",
    `Admin routes (${buckets.admin.length}):`,
    ...buckets.admin.map((r) => `  - ${r}`),
  ].join("\n");
}

// ---- Public server function ----------------------------------------------

export const runDeepAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    await ensureAdmin(userId);

    const startedAt = new Date();
    const [schema, rls, errors, integrations] = await Promise.all([
      collectSchema(),
      collectRls(),
      collectErrorLogSummary(),
      collectIntegrationStatus(),
    ]);
    const serverFns = collectServerFns();
    const routes = collectRoutes();

    const snapshot =
      `\n========================\nLIVE APP SNAPSHOT\n` +
      `Generated: ${startedAt.toISOString()}\n========================\n\n` +
      `--- INTEGRATIONS ---\n${integrations}\n\n` +
      `--- DATABASE SCHEMA (public) ---\n${schema}\n\n` +
      `--- ROW LEVEL SECURITY (public) ---\n${rls}\n\n` +
      `--- SERVER FUNCTIONS (createServerFn) ---\n${serverFns}\n\n` +
      `--- ROUTES (file-based) ---\n${routes}\n\n` +
      `--- ERROR LOG SUMMARY ---\n${errors}\n\n` +
      `========================\nEND SNAPSHOT\n========================\n`;

    const text = MEGA_AUDIT_PROMPT + snapshot;

    return {
      ok: true as const,
      generated_at: startedAt.toISOString(),
      length: text.length,
      text,
    };
  });

// =========================================================================
// Pricing Audit — focused diagnostic for the pricing-v2 pipeline.
// Answers "why aren't items landing in the catalog and why can't recipes
// be costed?" Read-only. Admin-only. Returns a Markdown report.
// =========================================================================

const PRICING_AUDIT_INTRO = `# Pricing v2 — Diagnostic audit

This is a read-only snapshot of the pricing-v2 pipeline: what's in the
catalog, what's stuck, and what to do next. All data is live from the
database. No secrets, no PII.

`;

function md(s: string) {
  return s.replace(/\|/g, "\\|");
}

async function safeCount(table: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let q = supabaseAdmin.from(table as any).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function collectInventoryCoverage() {
  const [total, mapped] = await Promise.all([
    safeCount("inventory_items"),
    safeCount("inventory_items", (q) => q.not("kroger_product_id", "is", null)),
  ]);
  if (total == null) return "(inventory_items unavailable)";
  const pct = total > 0 ? ((mapped ?? 0) / total) * 100 : 0;
  return `- inventory_items total: **${total}**\n- mapped to kroger_product_id: **${mapped ?? 0}** (${pct.toFixed(1)}%)\n- unmapped: **${total - (mapped ?? 0)}**`;
}

async function collectBootstrapState() {
  const { data, error } = await supabaseAdmin
    .from("pricing_v2_catalog_bootstrap_state" as any)
    .select("store_id, status, total_items_fetched, started_at, completed_at, last_run_id, updated_at")
    .order("updated_at", { ascending: false } as any);
  if (error) return `(bootstrap_state unavailable: ${error.message})`;
  const rows = (data ?? []) as any[];
  if (!rows.length) return "(no bootstrap_state rows — bootstrap has never been initialized)";
  return rows
    .map(
      (r) =>
        `- store **${r.store_id}** · status=\`${r.status}\` · fetched=${r.total_items_fetched} · started=${r.started_at ?? "—"} · completed=${r.completed_at ?? "—"}`,
    )
    .join("\n");
}

async function collectRecentCatalogRuns() {
  const { data, error } = await supabaseAdmin
    .from("pricing_v2_runs" as any)
    .select("run_id, stage, status, started_at, ended_at, counts_in, counts_out, errors_count, params, last_error, triggered_by")
    .order("started_at", { ascending: false } as any)
    .limit(15);
  if (error) return `(runs unavailable: ${error.message})`;
  const rows = (data ?? []) as any[];
  if (!rows.length) return "(no runs recorded)";
  const header = "| started | stage | status | in | out | errs | dry | trigger | note |\n|---|---|---|---:|---:|---:|---|---|---|";
  const body = rows
    .map((r) => {
      const dry = r?.params?.dry_run === true ? "yes" : "no";
      const note = (r.last_error?.toString?.() ?? "").slice(0, 60);
      return `| ${r.started_at ?? "—"} | ${r.stage} | ${r.status} | ${r.counts_in ?? 0} | ${r.counts_out ?? 0} | ${r.errors_count ?? 0} | ${dry} | ${r.triggered_by ?? "—"} | ${md(note)} |`;
    })
    .join("\n");
  return `${header}\n${body}`;
}

async function collectItemCatalogQuality() {
  const { data, error } = await supabaseAdmin
    .from("pricing_v2_item_catalog" as any)
    .select("store_id, weight_source, net_weight_grams");
  if (error) return `(item_catalog unavailable: ${error.message})`;
  const rows = ((data ?? []) as unknown) as Array<{ store_id: string; weight_source: string | null; net_weight_grams: number | null }>;
  const total = rows.length;
  const realRows = rows.filter((r) => r.store_id !== "TEST");
  const withWeight = rows.filter((r) => r.net_weight_grams != null).length;
  const bySource = new Map<string, number>();
  for (const r of rows) {
    const k = r.weight_source ?? "null";
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }
  const sourceLines = Array.from(bySource.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  - \`${k}\`: ${v}`)
    .join("\n");
  return `- catalog rows total: **${total}** (real: ${realRows.length}, test fixtures: ${total - realRows.length})\n- rows with net_weight_grams: **${withWeight}** (${total ? ((withWeight / total) * 100).toFixed(0) : 0}%)\n- by weight_source:\n${sourceLines || "  (none)"}`;
}

async function collectErrorBreakdown() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("pricing_v2_errors" as any)
    .select("stage, type, severity, message")
    .gte("created_at", since)
    .order("created_at", { ascending: false } as any)
    .limit(500);
  if (error) return `(errors unavailable: ${error.message})`;
  const rows = ((data ?? []) as unknown) as Array<{ stage: string; type: string; severity: string; message: string }>;
  if (!rows.length) return "(no errors in the last 7 days)";
  const groups = new Map<string, { count: number; sample: string }>();
  for (const r of rows) {
    const k = `${r.stage} · ${r.type} · ${r.severity}`;
    const g = groups.get(k);
    if (g) g.count += 1;
    else groups.set(k, { count: 1, sample: (r.message ?? "").slice(0, 200) });
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[1].count - a[1].count);
  return sorted.map(([k, v]) => `- **${k}** ×${v.count}\n  > ${md(v.sample)}`).join("\n");
}

async function collectSettings() {
  const { data, error } = await supabaseAdmin
    .from("pricing_v2_settings" as any)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) return `(settings unavailable: ${error.message})`;
  if (!data) return "(no settings row)";
  const s = data as any;
  return [
    `- kroger_store_id: \`${s.kroger_store_id}\``,
    `- kroger_zip: \`${s.kroger_zip}\``,
    `- min_mapped_inventory_for_bootstrap: **${s.min_mapped_inventory_for_bootstrap}**`,
    `- warning_threshold_pct: ${s.warning_threshold_pct}`,
    `- zero_cost_blocking: ${s.zero_cost_blocking}`,
    `- default_menu_multiplier: ${s.default_menu_multiplier}`,
  ].join("\n");
}

function buildRecommendations(opts: {
  mappedCount: number | null;
  totalInventory: number | null;
  realCatalogRows: number;
  hasTriggerError: boolean;
  hasVolumeError: boolean;
  hasEachError: boolean;
  hasFreeTextError: boolean;
}) {
  const out: string[] = [];
  const mapPct =
    opts.mappedCount != null && opts.totalInventory && opts.totalInventory > 0
      ? (opts.mappedCount / opts.totalInventory) * 100
      : 0;
  if (opts.hasTriggerError) {
    out.push(
      "1. **Fix the `show_on_home` trigger.** A Postgres trigger references a column that no longer exists, blocking every recipe-ingredient update with `record \"new\" has no field \"show_on_home\"`. Find it with: `SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE pg_get_triggerdef(oid) ILIKE '%show_on_home%';` then drop or rewrite it.",
    );
  }
  if ((opts.mappedCount ?? 0) < 50 || mapPct < 25) {
    out.push(
      `2. **Map more inventory items to Kroger product IDs.** Only ${opts.mappedCount ?? 0} of ${opts.totalInventory ?? 0} are mapped. The catalog ingest is mapping-driven — it can never fetch products you haven't pointed it at. Use \`/admin/pricing-v2/catalog\` to bulk-map your top-volume items.`,
    );
  }
  if (opts.realCatalogRows < 10) {
    out.push(
      "3. **Run a real (non-dry) catalog bootstrap.** Recent runs have all been `dry_run=true` and never persisted. From `/admin/pricing-v2/catalog` uncheck dry-run and execute. After mapping more items in step 2, re-run to fill `pricing_v2_item_catalog`.",
    );
  }
  if (opts.hasVolumeError || opts.hasEachError) {
    out.push(
      "4. **Populate unit conversions.** Recipes using `cup`/`tbsp` need densities in `pricing_v2_unit_conversion_rules`; items using `each` need `each_weight_grams` on the inventory item. Without these, Stage 2 (recipe weight normalization) drops the row.",
    );
  }
  if (opts.hasFreeTextError) {
    out.push(
      "5. **Link free-text ingredients on published recipes to `ingredient_reference`.** Published recipes reject free-text. Either link via `/admin/recipes` or move the recipe back to draft.",
    );
  }
  if (out.length === 0) {
    out.push("Everything looks healthy. Re-run after the next bootstrap to confirm catalog growth.");
  }
  return out.join("\n\n");
}

export const runPricingAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    await ensureAdmin(userId);

    const startedAt = new Date();

    const [coverage, bootstrap, runs, quality, errors, settings] = await Promise.all([
      collectInventoryCoverage(),
      collectBootstrapState(),
      collectRecentCatalogRuns(),
      collectItemCatalogQuality(),
      collectErrorBreakdown(),
      collectSettings(),
    ]);

    // Pull a few raw signals for the recommendations engine.
    const [mappedCount, totalInventory, realCatalogCount] = await Promise.all([
      safeCount("inventory_items", (q) => q.not("kroger_product_id", "is", null)),
      safeCount("inventory_items"),
      safeCount("pricing_v2_item_catalog", (q) => q.neq("store_id", "TEST")),
    ]);

    const errLower = errors.toLowerCase();
    const recs = buildRecommendations({
      mappedCount,
      totalInventory,
      realCatalogRows: realCatalogCount ?? 0,
      hasTriggerError: errLower.includes("show_on_home"),
      hasVolumeError: errLower.includes("volume_unit_no_density") || errLower.includes("volume-based"),
      hasEachError: errLower.includes("each_unit_no_weight") || errLower.includes("each_weight_grams"),
      hasFreeTextError: errLower.includes("free-text ingredient"),
    });

    const text =
      PRICING_AUDIT_INTRO +
      `Generated: ${startedAt.toISOString()}\n\n` +
      `## 1 · Inventory ↔ catalog coverage\n${coverage}\n\n` +
      `## 2 · Bootstrap state\n${bootstrap}\n\n` +
      `## 3 · Recent runs (last 15)\n${runs}\n\n` +
      `## 4 · Item catalog quality\n${quality}\n\n` +
      `## 5 · Pipeline settings\n${settings}\n\n` +
      `## 6 · Error breakdown (last 7 days, grouped)\n${errors}\n\n` +
      `## 7 · Recommended next actions\n\n${recs}\n`;

    return {
      ok: true as const,
      generated_at: startedAt.toISOString(),
      length: text.length,
      text,
    };
  });
