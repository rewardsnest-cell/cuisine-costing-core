## Goal

Reset the Kroger pricing pipeline to a clean, minimal state with:
1. A hard-coded Kroger location (Cincinnati 45202).
2. Per-lb pricing as the canonical default with an editable global markup multiplier (default 3.0).
3. One clean admin page (`/admin/pricing`) replacing the eight tangled ones.
4. A reset action that wipes Kroger tables and zeros inventory costs so we can rebuild from scratch.

---

## What gets built

### 1. Hard-coded Kroger location

In `src/lib/server/kroger-core.ts`:
- Change `KROGER_DEFAULT_ZIP` from `"45202"` (already correct) but **also** export a `KROGER_HARDCODED_LOCATION_ID` constant. On first run we resolve 45202 → 8-char locationId via the Locations API and persist it in `app_kv` (already cached 30 days). Remove all UI/cron paths that accept an overriding `zip_code` payload — they all now ignore the override and use 45202.
- Update `runKrogerIngestInternal` and `kroger-daily-ingest` webhook to drop ZIP arguments entirely.

### 2. Per-lb pricing default

In `normalizeKrogerPrice` (`kroger-core.ts`):
- When the parsed canonical unit is a weight (`lb`, `oz`, `kg`, `g`), convert the per-unit price to **per-lb** before writing. `oz → /16`, `g → ×453.59`, `kg → ÷2.205`. Store `canonical_unit = 'lb'`.
- When the size parses to volume or `each`, keep current behavior (store in native unit). These remain usable but flagged in the new admin page as "non-weight".
- Add a small migration to record `canonical_unit` per row in `kroger_sku_map` (new column, nullable text) so the admin page can show what's per-lb vs not.

### 3. Editable global markup multiplier

`app_settings.markup_multiplier` already exists (default 3.0) and is consumed by `recalc-quote-pricing.functions.ts`. New work:
- A simple input on the new `/admin/pricing` page bound to that column with Save.
- Server function `updateMarkupMultiplier({ value })` with validation `0.5 ≤ x ≤ 10`.

### 4. New `/admin/pricing` page (single source of truth)

Three cards:

**a. Configuration**
- Read-only: Kroger location = "Cincinnati, OH (45202)".
- Editable: Markup multiplier (number input, default 3.0).

**b. Run pricing pull**
- Two buttons: "Bootstrap catalog" and "Refresh prices today".
- Both call existing `runKrogerIngestInternal` (already wired, already works from cron). Show last run summary (rows, errors, duration) from `kroger_ingest_runs`.

**c. Reset / clean slate** (destructive, with confirm dialog)
- Server function `resetPricingPipeline()` that:
  - `DELETE FROM kroger_sku_map`
  - `DELETE FROM kroger_ingest_runs`
  - `DELETE FROM kroger_bootstrap_progress`
  - `DELETE FROM kroger_validation_anomalies`
  - `DELETE FROM kroger_validation_runs`
  - `DELETE FROM price_history`
  - `UPDATE inventory_items SET average_cost_per_unit = 0, last_receipt_cost = 0`
  - Returns counts.
- Confirmation dialog requires typing `RESET` to enable the button.

### 5. Retire old admin pages

Delete these route files and remove their entries from `src/routes/admin.tsx` sidebar:
- `kroger-pricing.tsx`
- `kroger-sku-review.tsx`
- `kroger-mapping-diagnostics.tsx`
- `kroger-price-signals.tsx`
- `kroger-validation.tsx`
- `kroger-ingest-runs.tsx`
- `ingest-diagnostics.tsx`
- `receipt-kroger-diagnostics.tsx`
- `pricing-pipeline.tsx`, `pricing-test.tsx`, `pricing-sandbox.tsx`, `pricing-lab.tsx`, `pricing-lab.preview.tsx` (legacy experiments)

`recalc-quote-pricing` and the cron webhook stay — they consume the data, they aren't admin UI.

---

## Technical details

**Files created**
- `src/routes/admin/pricing.tsx` — the new single page.
- `src/lib/server-fns/pricing-admin.functions.ts` — `updateMarkupMultiplier`, `resetPricingPipeline`, `getPricingStatus` (last run + counts).

**Files edited**
- `src/lib/server/kroger-core.ts` — remove ZIP override paths, force 45202, add per-lb conversion in `normalizeKrogerPrice`.
- `src/lib/server/kroger-ingest-internal.ts` — drop ZIP arg, write `canonical_unit` column.
- `src/routes/api/public/hooks/kroger-daily-ingest.ts` — ignore `zip_code` payload.
- `src/lib/server-fns/kroger-pricing.functions.ts` — keep `runKrogerIngest` thin wrapper used by new page; remove unused legacy exports.
- `src/routes/admin.tsx` — sidebar cleanup.

**Files deleted** (13 route files listed above).

**DB migration**
- `ALTER TABLE kroger_sku_map ADD COLUMN canonical_unit text;`
- No data migration needed — old rows get wiped by the reset action.

**What stays untouched**
- `inventory_items` schema (still has `unit`, `average_cost_per_unit`).
- Recipe costing logic in `src/lib/recipe-costing.ts` — already converts between units, will work with per-lb inventory transparently.
- `app_settings.markup_multiplier` + `recalc-quote-pricing.functions.ts`.

---

## Workflow after this lands

1. Open `/admin/pricing`.
2. Click **Reset** → type `RESET` → confirm. (Wipes Kroger tables + zeroes inventory costs.)
3. Adjust **Markup multiplier** if not 3.0.
4. Click **Bootstrap catalog** → wait. SKUs populate `kroger_sku_map` with per-lb prices where size parses.
5. Click **Refresh prices today** to hydrate `inventory_items.average_cost_per_unit` from confirmed SKUs.
6. Quote pricing automatically uses the new costs × markup.
