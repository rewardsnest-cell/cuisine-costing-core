

User confirms: reorganize admin + add help cards + consolidate the two "national" pages as discussed.

## Plan

### 1. Reusable help card
- Create `src/components/admin/PageHelpCard.tsx` — sage-accent card with title, purpose, when-to-use, related links, and a "Hide" toggle persisted in `localStorage` per route.
- Create `src/lib/admin/page-help.ts` — central registry mapping each admin route to `{ title, purpose, whenToUse, related[] }` so all copy lives in one file.

### 2. Reorganize sidebar in `src/routes/admin.tsx`
Group ~30 pages into 6 collapsible `SidebarGroup`s (active group auto-expands):

```text
PRICING INTELLIGENCE   national-prices, margin-volatility, trends,
                       competitor-trends, competitor-quotes, quick-quote
RECIPES & MENU         recipe-hub, recipes, menu, generate-recipe-photos,
                       servings-review, newsletter-guide
INGREDIENTS            ingredient-reference, synonyms, auto-link-ingredients,
                       ingredients/review-unlinked
INVENTORY & SOURCING   inventory, suppliers, purchase-orders, receipts,
                       uploads, scan-flyer, sales
EVENTS & PEOPLE        quotes, events, schedule, timesheet, employees,
                       users, access
SYSTEM                 integrations, brand-colors, affiliates, feedback,
                       exports, import-recipes, scan-assets
```

### 3. Consolidate the two "National" pages
- Convert `src/routes/admin/national-prices.tsx` to a `Tabs` shell:
  - **Overview** — status strip (active month, coverage, last FRED pull, flag state)
  - **FRED Sources** — existing `FredMappingsManager` + `FredPullPanel` + new small Pull History table reading `fred_pull_log`
  - **Monthly Snapshots** — staging review + Activate (moved from `pricing.national.tsx`)
  - **Manual Entry** — existing CSV/single-row form
- Replace `src/routes/admin/pricing.national.tsx` with a redirect to `/admin/national-prices?tab=snapshots`.

### 4. Add `<PageHelpCard route="..." />` to every admin page
~30 one-line additions at the top of each route's component. Copy sourced from the existing `/mnt/documents/vpsfinest-system-extraction.md` audit so wording is accurate.

### Out of scope
- No DB changes, no new server functions, no logic changes
- URLs unchanged except the one consolidation (with redirect)

### Risk
Low. Help cards are additive; sidebar regrouping is visual; the merged page reuses existing components verbatim.

