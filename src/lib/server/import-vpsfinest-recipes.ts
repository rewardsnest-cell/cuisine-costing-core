// ARCHIVED — Pricing v1 importer. See /docs/pricing-archive.md.
// The original implementation seeded fred_series_map and price_history, both of
// which were moved to the archive schema. Re-enable only against Pricing v2.
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

export async function importVpsfinestRecipes(): Promise<never> {
  throw new LegacyPricingArchivedError("importVpsfinestRecipes");
}
