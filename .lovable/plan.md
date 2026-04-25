## Problem

The admin **Kroger Pricing** page (`/admin/kroger-pricing`) shows two buttons — "Run Daily" and "Run Bootstrap" — but clicking either inserts **zero** SKUs into `kroger_sku_map`. Meanwhile, hitting the cron webhook directly (`/api/public/hooks/kroger-daily-ingest` with `mode: "catalog_bootstrap"`) successfully populates 50 SKUs.

## Root cause

The admin page and the cron webhook call **two completely different code paths**:

| Trigger | Server fn | Worker | Behavior |
|---|---|---|---|
| Cron webhook | route handler | `runKrogerIngestInternal` (`src/lib/server/kroger-ingest-internal.ts`) | Honors `mode`. Bootstrap iterates `BOOTSTRAP_SEARCH_TERMS` (a-z, 0-9), discovers products, upserts to `kroger_sku_map` with confidence scoring + `review_state`. **Works.** |
| Admin button | `runKrogerIngest` (`src/lib/server-fns/kroger-pricing.functions.ts:853`) | local `performIngest` (same file, line 234) | **Ignores `mode` entirely.** Iterates `inventory_items` (689 internal ingredient names), searches Kroger by item name, only writes to `kroger_sku_map` when a price is also found. |

The admin path fails because:
1. `mode` is read at line 867 then never used inside `performIngest` — bootstrap and daily do the exact same thing.
2. Inventory item names ("EVOO", "AP flour", etc.) rarely match Kroger product search terms cleanly, so most yield zero hits.
3. Even successful hits write `kroger_sku_map` rows without `review_state`, `reference_id`, or confidence scoring, so SKU Review can't surface them.

That's why prior runs from the admin page logged "Queried 500, wrote 0 price rows, touched 0 SKUs."

## Fix

**Route the admin page through the same internal worker the cron uses.** Replace the legacy `performIngest` body in `runKrogerIngest` with a call to `runKrogerIngestInternal`, so both buttons (and cron) share one implementation.

### Changes

**1. `src/lib/server-fns/kroger-pricing.functions.ts`**

- In `runKrogerIngest` handler (lines 853–908):
  - Remove the legacy `void performIngest(runRow.id, ...)` call.
  - Instead, call `runKrogerIngestInternal({ mode, zip_code: zip, limit, location_id: locationId })` from `@/lib/server/kroger-ingest-internal`.
  - Return the run result. Keep the existing flag/key/zip checks since they short-circuit faster with a friendly message before creating a run row.
  - Remove the pre-created `kroger_ingest_runs` row insert here — `runKrogerIngestInternal` creates its own run row. (Otherwise we'd get duplicate rows per click.)
- Leave `performIngest`, `runKrogerIngestSandbox`, and other consumers untouched (sandbox still uses the legacy path intentionally, or we mark it deprecated separately).

**2. Daily-update gating (carried over from prior plan)**

Once the admin button correctly runs `mode=catalog_bootstrap`, SKUs land as `pending`/`unmatched`. Daily updates still write 0 prices because `runDailyUpdate` filters on `review_state = 'confirmed'` and nothing promotes rows. Same two-line fix as before in `src/lib/server/kroger-ingest-internal.ts`:

- In bootstrap upsert (line ~293): when `bestScore >= 0.85`, set `review_state: "confirmed"` instead of `"pending"`.
- In daily_update query (line ~377): change `.eq("review_state", "confirmed")` to `.in("review_state", ["confirmed", "pending"]).gte("match_confidence", 0.7)`.

**3. UI clarity (`src/routes/admin/kroger-pricing.tsx`)**

- Add a small caption under the Bootstrap button noting it iterates Kroger's catalog (a-z + 0-9), not the local inventory list, so admins understand what each button does.

### Verification

After deploy, from the admin page:
1. Click **Run Bootstrap** → check `kroger_ingest_runs` newest row → expect `sku_map_rows_touched > 0` and message of the form `bootstrap: requests=…, unique SKUs=…`.
2. Click **Run Daily** → expect `price_rows_written > 0` (now that pending+confidence rows qualify).
3. Check `kroger_sku_map` distribution — high-confidence rows should be `confirmed`, mid-band still `pending`.

### Files to edit

- `src/lib/server-fns/kroger-pricing.functions.ts` — rewire `runKrogerIngest` to delegate to `runKrogerIngestInternal`.
- `src/lib/server/kroger-ingest-internal.ts` — auto-confirm at ≥0.85; relax daily_update filter.
- `src/routes/admin/kroger-pricing.tsx` — small caption clarifying button behavior.
- `src/lib/server/kroger-ingest-internal.test.ts` — add coverage for auto-confirm threshold and daily_update picking up pending rows.

No DB migrations required.