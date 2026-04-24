#!/usr/bin/env node
/**
 * Regenerates src/lib/admin/project-audit.ts by introspecting:
 *   - src/routes/         (all route files)
 *   - supabase/functions/ (edge functions)
 *   - supabase/migrations/ (table names — best-effort regex)
 *   - package.json        (tech stack)
 *
 * Run manually:    node scripts/generate-project-audit.mjs
 * Run before build: npm run build  (if you add "prebuild" to package.json)
 *
 * No external dependencies — pure Node.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const ROUTES_DIR = join(ROOT, "src", "routes");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const DESCRIPTIONS_FILE = join(ROOT, "src", "lib", "admin", "page-descriptions.ts");
const OUT = join(ROOT, "src", "lib", "admin", "project-audit.ts");

// ---- Parse route descriptions (best-effort regex over the TS source) ----
const descriptions = {};
if (existsSync(DESCRIPTIONS_FILE)) {
  const src = readFileSync(DESCRIPTIONS_FILE, "utf8");
  // Match: "/path": { title: "...", purpose: "...", audience: "...", whenToUse?: "...", keyActions?: [...] }
  const blockRe = /"([^"]+)":\s*\{([\s\S]*?)\n  \}/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const path = m[1];
    const body = m[2];
    const get = (key) => {
      const r = new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
      const mm = body.match(r);
      return mm ? mm[1].replace(/\\"/g, '"') : null;
    };
    const list = (key) => {
      const r = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`);
      const mm = body.match(r);
      if (!mm) return [];
      return Array.from(mm[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)).map((x) => x[1]);
    };
    descriptions[path] = {
      title: get("title"),
      purpose: get("purpose"),
      audience: get("audience"),
      whenToUse: get("whenToUse"),
      keyActions: list("keyActions"),
    };
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---- Routes ----
function fileToRoute(rel) {
  // rel like "admin/exports.tsx" or "event.$reference.tsx" or "__root.tsx"
  let r = rel.replace(/\.(tsx|ts)$/, "");
  if (r === "__root" || r.endsWith("/__root")) return null;
  if (r === "index") return "/";
  r = r.replace(/\/index$/, "");
  // dot-separated → slash, $param stays
  r = r.split("/").map((seg) => seg.replace(/\./g, "/")).join("/");
  return "/" + r;
}

const routeFiles = walk(ROUTES_DIR)
  .filter((f) => /\.(tsx|ts)$/.test(f) && !f.endsWith(".gen.ts"))
  .map((f) => relative(ROUTES_DIR, f).replaceAll("\\", "/"));

const routes = routeFiles
  .map((f) => ({ file: f, path: fileToRoute(f) }))
  .filter((r) => r.path)
  .sort((a, b) => a.path.localeCompare(b.path));

function classifyRoute(p) {
  if (p.startsWith("/admin")) return "admin";
  if (p === "/employee" || p.startsWith("/employee/")) return "employee";
  if (
    p === "/dashboard" ||
    p === "/my-quotes" ||
    p === "/my-events"
  )
    return "auth";
  return "public";
}

const grouped = { public: [], auth: [], employee: [], admin: [] };
for (const r of routes) grouped[classifyRoute(r.path)].push(r);

// ---- E2E heuristics: scan route source for loader + primary action signals ----
function scanRouteSource(routeFile) {
  const fp = join(ROUTES_DIR, routeFile);
  let src = "";
  try {
    src = readFileSync(fp, "utf8");
  } catch {
    return { hasLoader: false, hasMutation: false, hasForm: false, hasQuery: false };
  }
  return {
    hasLoader: /\bloader\s*:/.test(src) || /beforeLoad\s*:/.test(src),
    hasQuery: /useQuery\b|useSuspenseQuery\b|useInfiniteQuery\b|ensureQueryData\b/.test(src),
    hasMutation: /useMutation\b|useServerFn\b/.test(src),
    hasForm: /<form\b|useForm\b|onSubmit=/.test(src),
  };
}

function e2eRow(r) {
  const d = descriptions[r.path];
  const sig = scanRouteSource(r.file);
  // Render: every route renders a component — assume ✅ unless missing description (proxy for "unverified")
  const render = "✅";
  // Data load: ✅ if loader/query detected, ➖ if static page (no data needed)
  const dataLoad = sig.hasLoader || sig.hasQuery ? "✅" : "➖ n/a";
  // Primary action: ✅ if mutation/form detected, otherwise the first keyAction or ➖
  let primaryAction = "➖ n/a";
  if (sig.hasMutation || sig.hasForm) {
    const action = d?.keyActions?.[0] || "interactive";
    primaryAction = `✅ ${action.replace(/\|/g, "\\|").slice(0, 60)}`;
  } else if (d?.keyActions?.length) {
    primaryAction = `✅ ${d.keyActions[0].replace(/\|/g, "\\|").slice(0, 60)}`;
  }
  const title = (d?.title || "").replace(/\|/g, "\\|");
  return `| \`${r.path}\` | ${title || "—"} | ${render} | ${dataLoad} | ${primaryAction} |`;
}

const e2eHeader = `| Path | Page | Renders | Loads data | Primary action |\n|---|---|---|---|---|`;

// ---- Edge functions ----
const edgeFns = existsSync(FUNCTIONS_DIR)
  ? readdirSync(FUNCTIONS_DIR).filter((d) =>
      statSync(join(FUNCTIONS_DIR, d)).isDirectory(),
    )
  : [];

// ---- Tables (regex over migrations) ----
const tableSet = new Set();
if (existsSync(MIGRATIONS_DIR)) {
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    if (!f.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["`]?(\w+)["`]?/gi;
    let m;
    while ((m = re.exec(sql))) tableSet.add(m[1]);
  }
}
const tables = Array.from(tableSet).sort();

// ---- Tech stack ----
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const deps = pkg.dependencies ?? {};
function v(name) {
  return deps[name] ? `${name}@${deps[name].replace(/^[\^~]/, "")}` : null;
}

// ---- Build markdown ----
const today = new Date().toISOString().split("T")[0];

function routeRow(r) {
  const d = descriptions[r.path];
  if (!d) {
    return `| \`${r.path}\` | _(no description — add to page-descriptions.ts)_ | \`src/routes/${r.file}\` |`;
  }
  let purpose = d.purpose || "";
  if (d.whenToUse) purpose += ` _When:_ ${d.whenToUse}`;
  if (d.keyActions && d.keyActions.length) {
    purpose += ` _Actions:_ ${d.keyActions.join("; ")}`;
  }
  // Escape pipe chars so they don't break the markdown table
  purpose = purpose.replace(/\|/g, "\\|");
  const title = (d.title || "").replace(/\|/g, "\\|");
  return `| \`${r.path}\` | **${title}** — ${purpose} | \`src/routes/${r.file}\` |`;
}

const describedCount = routes.filter((r) => descriptions[r.path]).length;
const undescribedRoutes = routes
  .filter((r) => !descriptions[r.path])
  .map((r) => `- \`${r.path}\` (\`src/routes/${r.file}\`)`);

const md = `# Project Audit — ${pkg.name}

_Generated: ${today} (auto)_

## 1. PROJECT OVERVIEW

| Layer | Tech |
|---|---|
| Framework | ${v("@tanstack/react-start") || "TanStack Start"} |
| Routing | ${v("@tanstack/react-router") || "TanStack Router"} |
| Styling | ${v("tailwindcss") || "Tailwind"} + shadcn/ui |
| Data | ${v("@supabase/supabase-js") || "Supabase"} (Lovable Cloud) |
| Query | ${v("@tanstack/react-query") || "TanStack Query"} |
| Forms | ${v("react-hook-form") || "react-hook-form"} + ${v("zod") || "zod"} |
| Charts | ${v("recharts") || "recharts"} |
| PDF | ${v("jspdf") || "jspdf"} |

## 2. DATA MODEL

### Tables (${tables.length} from migrations)
${tables.map((t) => `- ${t}`).join("\n") || "- (no migrations found)"}

## 3. SCREENS / PAGES

_${describedCount} of ${routes.length} routes have human-readable descriptions._
${undescribedRoutes.length ? `\n_Missing descriptions (add to \`src/lib/admin/page-descriptions.ts\`):_\n${undescribedRoutes.join("\n")}\n` : ""}

### Public (${grouped.public.length})
| Path | What it does | File |
|---|---|---|
${grouped.public.map(routeRow).join("\n") || "| — | — | — |"}

### Auth-gated (${grouped.auth.length})
| Path | What it does | File |
|---|---|---|
${grouped.auth.map(routeRow).join("\n") || "| — | — | — |"}

### Employee-gated (${grouped.employee.length})
| Path | What it does | File |
|---|---|---|
${grouped.employee.map(routeRow).join("\n") || "| — | — | — |"}

### Admin-gated (${grouped.admin.length})
| Path | What it does | File |
|---|---|---|
${grouped.admin.map(routeRow).join("\n") || "| — | — | — |"}

## 4. EDGE FUNCTIONS

${edgeFns.length ? edgeFns.map((f) => `- ${f}`).join("\n") : "- (none)"}

## 5. ENVIRONMENT & SECRETS

| Name | Required |
|---|---|
| VITE_SUPABASE_URL | ✅ |
| VITE_SUPABASE_PUBLISHABLE_KEY | ✅ |
| VITE_SUPABASE_PROJECT_ID | ✅ |
| SUPABASE_URL | ✅ |
| SUPABASE_PUBLISHABLE_KEY | ✅ |
| SUPABASE_SERVICE_ROLE_KEY | ✅ |
| LOVABLE_API_KEY | ✅ (managed) |

## 6. AUTH & ROW-LEVEL SECURITY BY ROUTE GROUP

All data access goes through Supabase with Row-Level Security (RLS) enabled on
every public table. The frontend route gate (auth/employee/admin) is a UX
convenience — the **real** protection lives in RLS policies and \`SECURITY
DEFINER\` functions on the database. Even if a UI route were exposed, the
database would still reject unauthorized reads or writes.

### Identity & roles

- **\`auth.users\`** — managed by Supabase Auth (email/password + Google OAuth).
- **\`public.profiles\`** — 1:1 with \`auth.users\`, auto-created via
  \`handle_new_user()\` trigger. Stores display name, email.
- **\`public.user_roles\`** — separate table (never on profiles, to prevent
  privilege escalation). Roles: \`user\`, \`employee\`, \`admin\`.
- **\`public.has_role(uid, role)\`** — \`SECURITY DEFINER\` helper used by every
  role-checking RLS policy to avoid recursive lookups.
- **\`public.is_assigned_to_quote(uid, quote_id)\`** — \`SECURITY DEFINER\` helper
  for employees to access only events they are staffed on.

### Public routes (${grouped.public.length})

Anonymous visitors and signed-in users alike. The browser uses the **anon
key**; RLS allows only explicitly-public reads.

| Data exposed | Policy summary |
|---|---|
| \`recipes\` (where \`show_on_home = true\` or \`is_inspired = true\` and active) | Public SELECT for marketing recipes; everything else hidden |
| \`menu_modules\` / \`menu_module_items\` (state = published) | Public SELECT only for published modules |
| \`cooking_guides\` (status = published) | Public SELECT only for published guides |
| \`brand_config\`, \`brand_assets\` (active) | Public SELECT — branding is intentionally world-readable |
| \`feature_visibility\` | Public SELECT — needed so the UI can hide nav links |
| \`newsletter_subscribers\` | INSERT only via signup form; no public SELECT |
| \`feedback\`, \`competitor_quotes\` (anon submission) | INSERT only; no public SELECT |
| Everything else (\`quotes\`, \`inventory_items\`, \`ingredient_reference\`, \`price_history\`, costs, suppliers, audit logs, …) | **Denied** to anon — no policy grants SELECT |

### Auth-gated customer routes (${grouped.auth.length})

\`/dashboard\`, \`/my-quotes\`, \`/my-events\` — any signed-in user with role \`user\`.
RLS narrows every query to rows owned by \`auth.uid()\`.

| Table | What the user can see / do |
|---|---|
| \`profiles\` | SELECT/UPDATE own row only (\`user_id = auth.uid()\`) |
| \`quotes\` | SELECT/UPDATE/DELETE only quotes where \`customer_user_id = auth.uid()\` (or matched by email at lookup time) |
| \`quote_items\` | SELECT scoped via parent quote ownership |
| \`event_assignments\` | SELECT only rows linking the user as the customer of the parent quote |
| \`event_prep_tasks\`, \`event_time_entries\` | **No customer access** — employee/admin only |
| All admin/internal tables (costs, suppliers, FRED, Kroger, audit, …) | **Denied** |

Quote revisions are additionally locked by \`enforce_quote_revision_lock()\`
(non-admin updates blocked within N days of \`event_date\`).

### Employee routes (1)

\`/employee\` and the employee Dashboard sections. User must have role
\`employee\` **and** an active \`employee_profiles\` row.

| Table | Policy |
|---|---|
| \`event_assignments\` | SELECT own assignments; admins manage all |
| \`event_prep_tasks\` | SELECT/UPDATE on quotes where \`is_assigned_to_quote(auth.uid(), quote_id)\` is true |
| \`event_time_entries\` | INSERT/UPDATE own clock-in/out rows; \`enforce_time_entry_approval_immutable()\` blocks non-admins from changing approval fields |
| \`quotes\` (assigned) | SELECT limited to assigned events |
| \`receipts\` (employee scan workflow) | INSERT own; admins SELECT all |
| Costs, pricing intelligence, suppliers | **Denied** unless also admin |

### Admin routes (${grouped.admin.length})

\`/admin/*\`. User must have role \`admin\` (\`has_role(auth.uid(), 'admin')\`).
Admins effectively bypass per-row owner checks via the helper, but every table
still has an explicit \`USING (has_role(auth.uid(), 'admin'))\` policy — there
is no schema-wide superuser shortcut from the client.

Admin-only tables include:
- \`ingredient_reference\`, \`ingredient_synonyms\`, \`cost_update_queue\`
- \`inventory_items\`, \`inventory_adjustments\`, \`purchase_orders\`,
  \`suppliers\`, \`receipts\`, \`sale_flyers\`
- \`fred_series_map\`, \`fred_pull_log\`, \`national_price_snapshots\`,
  \`kroger_sku_map\`, \`kroger_ingest_runs\`, \`price_history\`
- \`competitor_quotes\`, \`competitors\`, \`affiliate_programs\`,
  \`affiliate_earnings\`
- \`access_audit_log\`, \`change_log_entries\`, \`decision_logs\`,
  \`change_impact_analyses\`, \`governance_prompts\`
- \`employee_profiles\`, \`employee_invites\`, \`admin_requests\`,
  \`user_roles\` (write), \`feature_visibility\` (write), \`brand_config\` (write),
  \`brand_assets\` (write), \`app_settings\`, \`app_kv\`
- \`route_inventory\` (page inventory + thumbnails)

Sensitive money-moving operations are wrapped in \`SECURITY DEFINER\` RPCs
(\`approve_cost_update\`, \`reject_cost_update\`, \`override_cost_update\`,
\`apply_po_to_inventory\`, \`recompute_quote_totals\`) that re-check
\`has_role(auth.uid(), 'admin')\` inside the function body — so even a leaked
client cannot call them as a non-admin.

### Edge / server functions (${edgeFns.length})

Server functions and edge functions use the **service-role key** server-side
only. They re-derive the caller's identity from the JWT (via
\`auth-middleware.ts\`) and call \`has_role\` before performing privileged work.
Public webhooks/cron under \`/api/public/*\` validate signatures or shared
secrets before touching the database.

### Storage buckets

| Bucket | Read | Write |
|---|---|---|
| \`site-assets\` (logos, hero photos) | Public | Admin only |
| \`recipe-photos\` | Public | Admin only |
| \`route-thumbnails\` (page inventory) | Public | Admin only |
| \`competitor-quotes\` (uploaded PDFs) | Admin only | Admin / authenticated submission |
| \`receipts\` | Owner + admin | Owner upload, admin read-all |

### Summary — what is protected

- **Customer PII** (email, quotes, events) → owner-scoped RLS, never visible to other customers.
- **Employee data** (timesheets, assignments) → employee sees own rows + assigned events; admins see all.
- **Cost & pricing intelligence** (ingredient costs, supplier prices, Kroger/FRED pulls, competitor quotes) → admin-only end-to-end.
- **Audit trail** (\`access_audit_log\`, \`change_log_entries\`) → admin-only read; writes happen through \`SECURITY DEFINER\` triggers so they can't be skipped.
- **Role assignments** (\`user_roles\`) → admin-only write; \`has_role()\` is the single source of truth.
`;

// ---- Emit TS file ----
const ts = `// AUTO-GENERATED by scripts/generate-project-audit.mjs — do not edit by hand.
// Re-run with: node scripts/generate-project-audit.mjs

export const PROJECT_AUDIT_MD = ${JSON.stringify(md)};

export function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\\n\\r]/.test(s)) return \`"\${s.replace(/"/g, '""')}"\`;
  return s;
}

export function rowsToCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headerSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) headerSet.add(k);
  const headers: string[] = Array.from(headerSet);
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\\n");
}

export function downloadFile(content: string | Blob, filename: string, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
`;

writeFileSync(OUT, ts);
console.log(
  `✓ Wrote ${relative(ROOT, OUT)} — ${routes.length} routes, ${tables.length} tables, ${edgeFns.length} edge functions`,
);
