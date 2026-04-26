# Pricing v2 Audit — Why items aren't landing in the catalog

## TL;DR

The pipeline isn't broken — it's gated and starved. The catalog stage only pulls Kroger products for inventory items that have a `kroger_product_id` mapped, and **only 1 of 689 inventory items has that mapping**. Bootstrap state is still `NOT_STARTED`, and recent "real" runs returned 0–1 items because there was nothing to fetch.

## What I checked (live data)

**Tables:**
- `pricing_v2_item_catalog`: **13 rows total** — 6 are real test fixtures (`store_id='TEST'`), only **1 real Kroger product** (`Kroger® Active Dry Yeast`), 6 from older test runs.
- `pricing_v2_kroger_catalog_raw`: 14 rows (mostly the same test fixtures + the one real product).
- `inventory_items`: 689 rows, **only 1 has `kroger_product_id` set**.
- `pricing_v2_catalog_bootstrap_state` for store `01400376`: `status=NOT_STARTED`, `total_items_fetched=0`, no `started_at`.
- `pricing_v2_settings.min_mapped_inventory_for_bootstrap = 1` (gate is permissive).

**Recent `catalog` runs (`pricing_v2_runs`):**

```text
status   counts_in  counts_out  params
success     1           1       dry_run=false               ← only run that wrote anything
success     1           0       dry_run=true                ← dry runs never persist
success     1           0       dry_run=true
success     1           0       dry_run=true
failed      0           0       (orphaned, killed by enum-fix)
failed      0           0       (orphaned)
failed      0           0       (orphaned)
```

The `1` that flowed through is the single mapped inventory item (Active Dry Yeast). Every other "real" attempt was either a dry run, an orphan, or had nothing to ingest.

**Recent errors (`pricing_v2_errors`)** are concentrated in `recipe_weight_normalization`, not catalog ingest:
- `VOLUME_UNIT_NO_DENSITY` — recipes use `cup`, `tbsp` without densities defined.
- `EACH_UNIT_NO_WEIGHT` — items use `each` with no `each_weight_grams`.
- `ZERO_OR_NEG_GRAMS` from a trigger: `record "new" has no field "show_on_home"` — a Postgres trigger on a recipe table references a missing column. This blocks recipe weight normalization writes.
- `Cannot add a free-text ingredient … to a published recipe; link it to ingredient_reference first or move the recipe back to draft` — recipes published before ingredients were linked.

## Root causes (ranked)

1. **Catalog ingest is mapping-driven, not catalog-driven.** `runCatalogBootstrap` in `src/lib/server-fns/pricing-v2-catalog.functions.ts` collects `kroger_product_id` values from `inventory_items` and calls `fetchProductsByIds(...)`. With only 1 inventory item mapped, the pipeline can fetch at most 1 product per run. Without a Kroger ID, the keyword search path (`searchProducts`) only runs when an explicit `keyword` is passed — the UI hasn't been triggering that.
2. **Bootstrap_state never advanced.** All real ingest attempts ran in `dry_run=true` (4 of 7) or were orphaned by the earlier enum-value bug (3 of 7). The single non-dry success only persisted 1 row and didn't advance `total_items_fetched` enough to flip `status` to `IN_PROGRESS`/`COMPLETED`.
3. **Trigger bug blocks recipe normalization writes.** A trigger references a non-existent column `show_on_home`, surfacing as `record "new" has no field "show_on_home"` whenever Stage 2 tries to update a recipe ingredient. This explains the 1767 errors on the 04-25 21:31 normalization run.
4. **No volume/each conversions configured.** Even with a perfect catalog, recipes using `cup`, `tbsp`, `each` cannot be costed without densities and `each_weight_grams`. `pricing_v2_unit_conversion_rules` and inventory `each_weight_grams` are unpopulated for the offending ingredients.
5. **Inventory ↔ ingredient_reference linkage is incomplete.** Published recipes reject free-text ingredients, so even successful catalog ingest can't reach the recipes until ingredients are linked.

## What the audit will deliver (read-only, no code changes yet)

A downloadable Markdown report at `/admin/exports` (extending the existing Deep Audit) with these sections, all sourced from live DB:

1. **Catalog health**
   - Mapped inventory count vs total, % mapped, list of top-100 unmapped high-usage items.
   - Bootstrap_state per store, last cursor, completion %.
   - Last 20 catalog runs with `dry_run`, counts, errors, duration.
2. **Item catalog quality**
   - Rows by `weight_source` (parsed / manual / unknown).
   - Rows missing `net_weight_grams`, grouped by failure reason.
3. **Recipe normalization blockers**
   - Top error types with example messages (volume-no-density, each-no-weight, trigger errors).
   - List of recipes blocked by free-text ingredients on published recipes.
   - SQL snippet identifying the bad `show_on_home` trigger so it can be fixed.
4. **Pipeline gates**
   - Current `pricing_v2_settings` values (store ID, ZIP, thresholds, blocking flags).
   - Whether `min_mapped_inventory_for_bootstrap` would block a real bootstrap.
5. **Recommended next actions** (ordered, with effort estimate):
   1. Fix the `show_on_home` trigger (1 migration).
   2. Backfill `kroger_product_id` on top-N inventory items (UI exists at `/admin/pricing-v2/catalog`).
   3. Run a real (non-dry) bootstrap with `keyword` fallback for unmapped items.
   4. Populate volume densities + `each_weight_grams` for the ingredients listed in §3.
   5. Link free-text ingredients on published recipes to `ingredient_reference`.

## Implementation (after approval)

- Add `runPricingAudit` server function in `src/lib/server-fns/deep-audit.functions.ts` that aggregates the queries above into a single Markdown blob.
- Add a "Pricing audit" button to the existing Deep Audit card on `/admin/exports` (separate from the architecture audit so the two don't collide). Same preview + download UX.
- No schema changes. No data writes. Read-only RPCs only — reuses the admin guard already on the page.

## Files touched

- `src/lib/server-fns/deep-audit.functions.ts` — add `runPricingAudit`.
- `src/routes/admin/exports.tsx` — add second button + state to the existing `DeepAuditCard` (or sibling `PricingAuditCard`).

No migrations. No RLS changes.
