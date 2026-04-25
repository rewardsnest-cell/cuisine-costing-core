# Pricing v2 — Foundation & Initialization Plan

## Status as of this turn

### ✅ Phase 0 — Legacy archive
- Tables already in `archive` schema: `fred_pull_log`, `fred_series_map`, `kroger_bootstrap_progress`, `kroger_ingest_runs`, `kroger_sku_map`, `kroger_validation_*`, `national_price_*`, `price_history`, `pricing_models*`, `cost_update_queue`.
- Legacy admin pages stubbed via `LegacyArchivedBanner` + `FredPullPanel`/`PricingHealthWidget` no-ops.
- **Remaining**: Admin nav grouping under "Archive" label (cosmetic; pages already banner-ed).

### ✅ Phase 1 — Server-side initialization (THIS TURN)
- New DB function `public.ensure_pricing_v2_initialized()` — idempotent, single transaction. Seeds `pricing_v2_settings` row, `pricing_v2_catalog_bootstrap_state` row, and `pricing_v2_pipeline_stages` registry.
- New DB function `public.ensure_access_initialized()` — idempotent seed of role × section permissions (all OFF for non-admin).
- New table `pricing_v2_pipeline_stages` (registry).
- Server fns `ensurePricingV2Initialized` / `ensureAccessInitialized` wrap the RPC calls.
- Pricing v2 Control Center loader calls `ensurePricingV2Initialized` on every navigation.
- `/admin/access` no longer auto-seeds from the browser — calls `ensureAccessInitialized` server-side instead.

### ✅ Phase 2 — Admin foundation
- `/admin/pricing-v2` Control Center exists with stage list, health tiles, self-test, Stage -1 gate banner.
- "Run Monthly Pipeline" button is disabled (correctly — gated until stages built).
- **Remaining**: Visual polish to display the new `pricing_v2_pipeline_stages` registry rather than the hard-coded `PRICING_V2_STAGES` constant. (Both currently coexist; safe.)

### 🟡 Phase 3 — Recipe weight normalization
- Route `/admin/pricing-v2/recipes-normalize` exists (632 lines).
- `getRecipeNormalizationGate` server fn exists and gates downstream stages.
- **Verify next turn**: blocked statuses (`blocked_volume_unit`, `blocked_missing_inventory`, `blocked_each_no_weight`) match spec; manual override flow with reason; dry-run; test harness.

### 🟡 Phase 4 — Kroger catalog bootstrap
- Route `/admin/pricing-v2/catalog` exists (533 lines).
- Tables `pricing_v2_kroger_catalog_raw`, `pricing_v2_item_catalog`, `pricing_v2_catalog_bootstrap_state` exist.
- Kroger client + weight parser exist (`src/lib/server/pricing-v2/`).
- **Verify next turn**: pagination with `last_page_token`, run-until-done semantics, auto-mark COMPLETED, typed-confirmation Reset button, weight-parse test harness.

### ❌ Phase 5/6 — Monthly pipeline + approval queue (NOT BUILT)
Required new tables:
- `pricing_v2_monthly_snapshots` (append-only Kroger price snapshots)
- `pricing_v2_receipt_lines_normalized` (cost_per_gram per observation)
- `pricing_v2_item_costs` (rolling avg with safety floor)
- `pricing_v2_cost_update_queue` (proposals requiring approval if Δ ≥ 10% or cost ≤ 0)
- `pricing_v2_recipe_costs` (rollup)
- `pricing_v2_menu_costs` (rollup)

Required server fns / routes:
- Stage 1 runner — monthly snapshot ingest
- Stage 2 runner — normalize new receipt lines
- Stage 3 runner — recompute cost_per_gram
- Stage 4 runner — compute rolling avg, emit warnings, populate approval queue
- Stage 5/6 runners — recipe + menu rollups (skip recipes with blocked ingredients)
- Approval UI page `/admin/pricing-v2/approvals`
- Pipeline orchestrator + cron route under `/api/public/hooks/pricing-v2-monthly`

Estimated 1–2 additional turns minimum.

## Non-negotiable rules (enforced)
1. ✅ UI never auto-seeds (access-control + pricing-v2 both moved server-side this turn).
2. ✅ All seeding is idempotent + transactional (`ensure_*_initialized` use SECURITY DEFINER, single tx).
3. 🟡 Pipeline downstream blocking — Stage -1 gate works; Stages 1–6 don't exist yet.
4. ✅ Weight-only canonical unit (grams) in `pricing_v2_item_catalog`.
5. 🟡 Monthly recompute — runner not built.
6. 🟡 ≥10% / zero cost approval queue — table + workflow not built.

## Next-turn ask
Pick one to tackle next:
- **A**: Phase 5/6 schema + Stage 1 runner (monthly Kroger snapshot)
- **B**: Approval queue table + UI
- **C**: Polish Phase 3/4 against spec (test harnesses, override flows)
- **D**: Wire Control Center to `pricing_v2_pipeline_stages` registry table
