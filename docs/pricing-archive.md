# Pricing v1 — Archived

The original ("v1") pricing pipeline has been retired. Its database tables were
moved out of `public` into a new `archive` schema, and every line of runtime
code that referenced them has been removed or replaced with an
`ARCHIVED` stub that throws `LegacyPricingArchivedError`.

**No data was deleted.** The archive is read-only and reachable only via the
database `service_role` for historical reference.

## What was archived

### Database (`archive` schema)
| Old name (`public.*`)            | New name (`archive.*`)            |
| -------------------------------- | --------------------------------- |
| `kroger_bootstrap_progress`      | `archive.kroger_bootstrap_progress` |
| `kroger_validation_anomalies`    | `archive.kroger_validation_anomalies` |
| `kroger_validation_runs`         | `archive.kroger_validation_runs`  |
| `kroger_ingest_runs`             | `archive.kroger_ingest_runs`      |
| `kroger_sku_map`                 | `archive.kroger_sku_map`          |
| `fred_pull_log`                  | `archive.fred_pull_log`           |
| `fred_series_map`                | `archive.fred_series_map`         |
| `national_price_staging`         | `archive.national_price_staging`  |
| `national_price_snapshots`       | `archive.national_price_snapshots` |
| `pricing_model_recipes`          | `archive.pricing_model_recipes`   |
| `pricing_models`                 | `archive.pricing_models`          |
| `price_history`                  | `archive.price_history`           |
| `cost_update_queue`              | `archive.cost_update_queue`       |

`anon` and `authenticated` roles have **zero** access. Only `service_role` and
`postgres` can read.

### Code

All server functions, hooks, and admin pages that touched the tables above
were replaced with stubs that:

- import `PRICING_ENGINE` / `LegacyPricingArchivedError` from
  `src/lib/pricing-engine.ts`
- export the same names so existing imports keep compiling
- throw `LegacyPricingArchivedError` (server functions) or render an
  `ARCHIVED` notice (UI components) at runtime

The legacy admin sidebar entries were removed from `src/routes/admin.tsx`
("Margin & Volatility", "National Prices", "Price Trends",
"Cost Update Queue", "Pricing Sandbox").

The cron webhooks `kroger-daily-ingest`, `kroger-validation`, and
`national-prices-monthly` now respond `410 Gone`.

## Going forward

```ts
import { PRICING_ENGINE } from "@/lib/pricing-engine";
// PRICING_ENGINE === "v2"
```

Wire all new pricing logic against Pricing v2. Do not add new code that reads
or writes any table in the `archive` schema.
