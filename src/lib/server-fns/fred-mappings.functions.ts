// ARCHIVED — Pricing v1 FRED mappings. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

const archived = (name: string) =>
  createServerFn({ method: "POST" }).handler(async () => {
    throw new LegacyPricingArchivedError(name);
  });

export const listFredMappings = archived("listFredMappings");
export const testFredSeries = archived("testFredSeries");
export const suggestFredMappings = archived("suggestFredMappings");
export const upsertFredMapping = archived("upsertFredMapping");
export const deleteFredMapping = archived("deleteFredMapping");
