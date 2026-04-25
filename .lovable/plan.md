# Pricing Intent Alignment Plan

## Current state (already aligned)

- Daily Kroger cron is live (`kroger-daily-ingest` at 04:30 UTC).
- ZIP → `locationId` resolved server-side (`resolveRunLocationId`), cached 30 days.
- `price_history` is **append-only INSERT**, with `source`, `unit_price`, `raw_package_price`, `promo`, `ingest_run_id`, `location_id`.
- Promo + regular both captured; `normalizeKrogerPrice` produces canonical `$/lb`, `$/oz`, `$/fl_oz`, `$/each` and quarantines unparseable sizes.
- SKU governance: `kroger_sku_map.review_state` gates daily writes — only `confirmed` SKUs produce price rows. Auto-suggested matches go to `pending`.
- `/admin/kroger-price-signals` is read-only by design.
- Receipts feed `price_history` (source=`receipt`) via `update-inventory-costs`.
- Weighted estimate already exists: `compute_internal_estimated_cost` (Kroger 40 / Manual 40 / Historical 20) with `propose_internal_cost_update` requiring approval on >±5% deltas.

## Gaps to close

### 1. Remove manual location control surface
The server fn `setKrogerLocationId` exists and lets an admin pin a `locationId` in `app_kv`. The pricing intent says **no manual location control**. Action:
- Delete `setKrogerLocationId` from `src/lib/server-fns/kroger-pricing.functions.ts`.
- Make `resolveRunLocationId` ignore the saved `kroger_location_id` KV row (keep ZIP-derived cache only).
- Drop the saved `kroger_location_id` value (one-time migration: `delete from app_kv where key='kroger_location_id'`).

### 2. Kroger must never directly set cost — only contribute observations
Today `propose_internal_cost_update(_source='kroger', _new_kroger=...)` directly updates `ingredient_reference.kroger_unit_cost` and recomputes the weighted estimate. Per the intent, Kroger should be a **smoothed market signal**, not the latest single observation. Action:
- Add a server fn `refresh_kroger_signal_from_history(reference_id)` that computes the **30-day median per-unit Kroger price** from `price_history` (ignoring promos for the level signal, using promos only for volatility).
- After each daily run, recompute Kroger signal for every confirmed-mapped reference using that median (not the day's spot price), then call `propose_internal_cost_update` with the smoothed value.
- Result: a single Kroger sale or one bad SKU cannot move the weighted estimate by itself.

### 3. Reject single-source price moves (gradual change rule)
Even with smoothing, a sustained Kroger drift could move estimates without a corroborating receipt. Action:
- Extend `propose_internal_cost_update` so when `_source='kroger'` and **no receipt observation exists in the last 60 days**, the proposed delta is **damped to ≤2%**. Larger moves go to the approval queue regardless of the existing 5% rule.
- Record the damping decision in `access_audit_log` so it shows up in explainability.

### 4. Promo separation in weighted model
Promos already get `promo=true` on `price_history`. Action:
- In the new `refresh_kroger_signal_from_history`, compute two stats: `regular_median_30d` (used for the level signal) and `promo_volatility_30d` (stddev of promo% off regular). Store both on `ingredient_reference` as `kroger_signal_median` and `kroger_signal_volatility` (new nullable numeric columns).
- Volatility is surfaced in the UI (Step 6) but does not feed the weighted cost.

### 5. FRED / national index as bound
Today FRED feeds `national_price_staging` and is applied via floor logic, but it's not part of the weighted estimate. Action (small, additive):
- When the FRED-derived national price for an ingredient is available, use it as a **bound**: clamp the weighted `internal_estimated_unit_cost` to `[national * 0.5, national * 2.0]`. Outside that band, queue for review instead of auto-applying.
- Implemented inside `propose_internal_cost_update` (or its caller) — no new tables.

### 6. Explainability surfaces (read-only)
The system must answer "Why did this price change?". Action:
- Add a "Why this price?" panel on `/admin/kroger-price-signals` per ingredient showing:
  - Current internal estimate + weights actually applied
  - Last 90d sparkline overlay: receipt vs. Kroger regular median vs. Kroger promo vs. FRED bound
  - Most recent `cost_update_queue` decisions (auto-applied, approved, rejected, damped)
  - Volatility flag (from `kroger_signal_volatility`)
- Pure read; no edit affordances.

### 7. Lock down "no price edits in admin UI"
Audit + remove any admin surface that mutates `ingredient_reference.manual_unit_cost` / `kroger_unit_cost` outside the approval queue path. (Manual cost entry should remain only inside the approval-queue **override** action, which already calls `override_cost_update` — keep that; remove any other direct edit forms if found during implementation.)

## Files

- `src/lib/server-fns/kroger-pricing.functions.ts` — remove `setKrogerLocationId`.
- `src/lib/server/kroger-core.ts` — change `resolveRunLocationId` to ignore saved KV.
- `src/lib/server/kroger-ingest-internal.ts` — after daily run, call new signal recompute fn for confirmed references.
- `src/lib/server-fns/cost-intelligence.functions.ts` — add `refreshKrogerSignalFromHistory` server fn + "why this price" data fetcher for the explainability panel.
- New migration:
  - `delete from app_kv where key='kroger_location_id'`
  - Add columns `ingredient_reference.kroger_signal_median numeric`, `kroger_signal_volatility numeric`, `kroger_signal_updated_at timestamptz`
  - Update `propose_internal_cost_update` to apply (a) damping when source='kroger' without recent receipts, (b) FRED-bound clamping, and to log both decisions to `access_audit_log`.
- `src/routes/admin/kroger-price-signals.tsx` — add the "Why this price?" expandable row (read-only).

## Out of scope

- Walmart / Costco ingestion (the architecture already supports it; not part of this change).
- Pricing-model changes for quotes (`recompute_quote_totals`) beyond what flows through `internal_estimated_unit_cost`.
- UI for receipts / FRED (already exist).

## Final outcome (verifiable)

- A single Kroger spot price cannot move `internal_estimated_unit_cost`.
- Removing `setKrogerLocationId` leaves no admin path to override location.
- `price_history` remains pure INSERT; replay is possible by re-running signal recompute over any time window.
- The "Why this price?" panel can answer the four questions in the intent: market vs. cost movement, volatility, and above/below market positioning.
