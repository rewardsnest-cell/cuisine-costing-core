/**
 * Pricing engine selector. The legacy v1 pipeline (Kroger ingest, FRED feeds,
 * national price snapshots, pricing models, price_history, cost_update_queue)
 * has been archived to the `archive` Postgres schema and removed from runtime
 * code. All new code MUST target Pricing v2.
 *
 * See /docs/pricing-archive.md for the full list of archived objects.
 */
export const PRICING_ENGINE = "v2" as const;
export type PricingEngine = typeof PRICING_ENGINE;

/** True when the caller is asking for legacy v1 behavior — always denied. */
export function isLegacyPricingEnabled(): false {
  return false;
}

/** Standard error thrown by archived legacy pricing entry points. */
export class LegacyPricingArchivedError extends Error {
  constructor(feature = "this pricing feature") {
    super(
      `${feature} was part of Pricing v1 and has been archived. ` +
        `See /docs/pricing-archive.md. Use Pricing v2 instead.`,
    );
    this.name = "LegacyPricingArchivedError";
  }
}
