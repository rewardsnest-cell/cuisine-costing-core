// ARCHIVED — Pricing v1 FRED bulk refresh. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

export const bulkRefreshRecipesFromFred = createServerFn({ method: "POST" }).handler(
  async () => {
    throw new LegacyPricingArchivedError("bulkRefreshRecipesFromFred");
  },
);
