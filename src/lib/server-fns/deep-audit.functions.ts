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
