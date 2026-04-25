// ARCHIVED — Pricing v1 admin actions. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

export const getPricingStatus = createServerFn({ method: "POST" }).handler(async () => {
  return {
    archived: true as const,
    markup_multiplier: 3,
    kroger_zip: "45202",
    keys_configured: false,
    sku_count: 0,
    kroger_price_rows: 0,
    inventory_count: 0,
    inventory_with_cost: 0,
    last_run: null as null,
  };
});

export const updateMarkupMultiplier = createServerFn({ method: "POST" }).handler(async () => {
  throw new LegacyPricingArchivedError("updateMarkupMultiplier");
});

export const runPricingIngest = createServerFn({ method: "POST" }).handler(async () => {
  throw new LegacyPricingArchivedError("runPricingIngest");
});

export const resetPricingPipeline = createServerFn({ method: "POST" }).handler(async () => {
  throw new LegacyPricingArchivedError("resetPricingPipeline");
});
