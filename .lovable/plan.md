## Goal

Build a single **Admin → Files & Reports** hub that captures every generated artifact (quotes, audits, pricing audits, newsletter guides, shopping lists, recipe cards, etc.) into one database, so you can browse, filter, download again, and compare runs over time.

## What already exists (we'll build on it, not replace)

- Table `public.user_downloads` already stores logged files with: `kind`, `module`, `filename`, `storage_path`, `public_url`, `mime_type`, `size_bytes`, `record_count`, `parameters` (JSONB snapshot of options), `generated_by_email`, `created_at`, plus source linkage (`source_id`, `source_label`).
- Helper `saveAndLogDownload()` in `src/lib/downloads/save-download.ts` already uploads the blob to storage AND inserts a row.
- An admin page `src/routes/admin/downloads.tsx` already lists `user_downloads` with filters by kind/module/user.
- Table `public.project_audit_exports` separately stores Deep Audit markdown content.

The gap: **the audit/pricing-audit downloads use `downloadFile()` (browser-only) and are NOT logged**, so they never show up in the hub. Quotes PDFs and a few other generators also bypass logging.

## Plan

### 1. Wire every "Run / Download" action into the central log

For each generator, switch from raw `downloadFile()` / browser anchor to `saveAndLogDownload()` so a row + storage copy is created every time. Coverage pass:

- Deep Audit (`src/routes/admin/exports.tsx` → `DeepAuditCard`) — kind `audit_export`, module `audit`, parameters = `{ promptVersion, scope }`.
- Pricing Audit (`exports.tsx` → `PricingAuditCard`) — kind `audit_export`, module `pricing`.
- Quote PDFs (`src/lib/generate-quote-pdf.ts` callers in `quote.tsx`, `admin/quotes.$id.tsx`, `q.$reference.tsx`) — kind `quote_pdf`, module `quote`, `source_id = quote.id`, parameters snapshot of totals/line counts.
- Newsletter Guide (`admin/newsletter-guide.tsx`) — kind `newsletter_guide`.
- Shopping list PDF/XLSX (`src/lib/cqh/shopping-list-*.ts`) — kind `shopping_list`.
- Recipe cards (`RecipeScaler.tsx`) — kind `recipe_card`.
- Pricing code inventory + intelligence exports — kind `admin_export`, module `pricing`.

Every call passes a real `parameters` JSON (filters, date ranges, scope) and `record_count` so reports are meaningful.

### 2. Also persist Deep Audit markdown into `project_audit_exports`

Keep the existing audit history table populated whenever a Deep Audit runs (insert row with `prompt_version`, `output_filename`, `output_content`, `executed_by`). This lets us diff two audit runs later.

### 3. New unified admin page: **Files & Reports** (`/admin/files-reports`)

A single hub with three tabs:

**Tab A — All files** (extends current `/admin/downloads`)
- Grouped by module (Audit, Pricing, Quotes, Recipes, Newsletter, Shopping, Other) with counts.
- Filters: module, kind, generator (user), date range, search by filename/source label.
- Each row: download (re-uses `public_url` or re-signed storage URL), open parameters drawer, delete.
- Bulk select → "Compare selected" (≥2 rows of same kind) opens compare view.

**Tab B — Reports**
- Daily/weekly chart: file count by module.
- "Top generators" table (by `generated_by_email`).
- Avg `record_count` per kind, total storage MB.
- Latest audit summary card (links to most recent Deep + Pricing audit).

**Tab C — Compare runs**
- Pick 2 rows of the same `kind`. For text artifacts (audits, SQL appendix, CSVs) show side-by-side with a basic line diff. For numeric artifacts (quotes, pricing audits) show a parameter diff + record_count delta.

### 4. Sidebar + dashboard links

- Add "Files & Reports" entry under the Overview/Operations group in `src/routes/admin.tsx` `NAV_GROUPS`.
- Add a dashboard tile on `/admin` linking to it.
- Redirect existing `/admin/downloads` to the new page (keep route as alias) so old links keep working.

### 5. Storage + DB hygiene

- No schema migration needed — `user_downloads` already has every column we need.
- Migration adds: small view `v_files_reports_daily` (date_trunc('day'), module, kind, count, sum bytes) for the Reports tab to query cheaply.
- Add a nightly retention setting (kept in `app_settings`) to optionally prune file blobs older than N days while keeping the metadata row.

## Technical notes

- All generator changes are in client components — `saveAndLogDownload` returns `{ persisted, publicUrl }` and falls back to a local download if the user is anonymous, so user-facing UX (the recent loading-spinner + toast pattern) is preserved.
- New page is a TanStack Start route file `src/routes/admin/files-reports.tsx` using `Route.useSearch()` for filter state (consistent with other admin pages) and `errorComponent` + `notFoundComponent`.
- Compare diff uses a tiny in-repo line-diff helper (no new heavy dep); for parameter diff, JSON.stringify with sorted keys.
- The view `v_files_reports_daily` is read with `supabase.from('v_files_reports_daily').select(...)`; RLS via `has_role(auth.uid(),'admin')`.

## Files touched

- New: `src/routes/admin/files-reports.tsx`, `src/lib/admin/files-reports/diff.ts`, migration adding the view.
- Edit: `exports.tsx` (audit + pricing audit cards), `newsletter-guide.tsx`, `quote.tsx`, `admin/quotes.$id.tsx`, `q.$reference.tsx`, `RecipeScaler.tsx`, `cqh/shopping-list-*.ts` callers, `pricing-code-inventory.tsx`, `intelligence.tsx`, `admin.tsx` (nav), `admin/index.tsx` (tile), `admin/downloads.tsx` (redirect).