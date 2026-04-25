# Connect All Downloads to Backend

Right now every "download" in the app (recipe cards, quote PDFs, audit exports, shopping lists, receipts) generates a file in the user's browser and disappears. Nothing is saved, nothing is logged, nothing is re-downloadable. This plan connects every download to the backend so:

1. Each generated file is **saved to storage** (`site-assets` bucket, `downloads/` prefix).
2. Each download is **logged** against the user (when signed in) in a new `user_downloads` table.
3. Users can revisit every file they've generated from a new **"My Downloads"** page.
4. Admins get a **unified Exports & Downloads hub** showing every file generated across the app.

## What gets connected

| Source | Current behavior | After |
|---|---|---|
| Recipe card PDF (`RecipeScaler`) | Local jsPDF download | Upload + log + local download |
| Printable recipe (`/api/recipes/$id/printable`) | Server HTML | Logged when opened by signed-in user |
| Quote PDF (`generate-quote-pdf.ts`) | Local download | Upload + log |
| Newsletter guide PDF | Local download | Upload + log |
| Project audit export | Already in `site-assets` | Logged in `user_downloads` |
| Admin CSV/JSON exports (Exports page) | Already in `site-assets` via `saveExportFile` | Logged in `user_downloads` |
| Shopping list export | (none yet) | New CSV/PDF download → upload + log |

## Database

New table `public.user_downloads`:
- `id uuid pk`, `user_id uuid` (nullable for anonymous), `kind text` (recipe_card, quote_pdf, audit_export, etc.)
- `filename text`, `storage_path text`, `public_url text`, `mime_type text`, `size_bytes int`
- `source_id text` (recipe_id, quote_id, etc. — for grouping), `source_label text`
- `created_at timestamptz default now()`
- RLS: users see their own rows; admins see everything; insert allowed for authenticated users for their own row.

Storage: reuse existing `site-assets` bucket under `downloads/{user_id|anon}/{yyyy-mm-dd}/`.

## Code changes

**New shared helper** `src/lib/downloads/save-download.ts`:
- `saveAndLogDownload({ blob, filename, kind, sourceId, sourceLabel })` — uploads to storage, inserts a `user_downloads` row, returns `{ url, path }`. Falls back to local-only download if user is anonymous or upload fails (so the button never breaks).

**Wire it into every download path:**
- `src/components/recipes/RecipeScaler.tsx` — wrap the existing `doc.save()` in the helper.
- `src/lib/generate-quote-pdf.ts` — same.
- `src/lib/newsletter-guide-pdf.ts` — same.
- `src/lib/admin/export-storage.ts` — after `saveExportFile`, insert a `user_downloads` row.
- `scripts/generate-project-audit.mjs` flow / audit export route — log on save.

**New user-facing page** `src/routes/my-downloads.tsx`:
- Lists current user's `user_downloads` rows, grouped by kind, with re-download links and a delete action.
- Add nav link in the user dropdown / dashboard.

**New admin view** `src/routes/admin/downloads.tsx`:
- Table of ALL downloads across users, filterable by kind / user / date.
- Adds `admin_downloads` feature flag to the existing visibility system, slotted into "System & Governance".

## Out of scope
- Replacing existing direct-download UX (the user still gets the file immediately).
- Migrating historical downloads — only new ones from this point forward are logged.
- Email delivery of files (can be a follow-up).
