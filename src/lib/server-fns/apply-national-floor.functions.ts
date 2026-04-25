// ARCHIVED — Pricing v1 national floor application. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

export const applyNationalFloorPricing = createServerFn({ method: "POST" }).handler(
  async () => {
    throw new LegacyPricingArchivedError("applyNationalFloorPricing");
  },
);
