// ARCHIVED — Pricing v1 national pricing activation. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

const archived = (name: string) =>
  createServerFn({ method: "POST" }).handler(async () => {
    throw new LegacyPricingArchivedError(name);
  });

export const getNationalPricingStatus = archived("getNationalPricingStatus");
export const getNationalPricingPreview = archived("getNationalPricingPreview");
export const upsertStagingRows = archived("upsertStagingRows");
export const activateNationalPrices = archived("activateNationalPrices");
