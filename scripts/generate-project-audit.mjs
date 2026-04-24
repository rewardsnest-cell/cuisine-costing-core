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
