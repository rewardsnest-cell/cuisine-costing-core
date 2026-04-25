// ARCHIVED — Pricing v1 Kroger ingest API. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

const archived = (name: string) =>
  createServerFn({ method: "POST" }).handler(async () => {
    throw new LegacyPricingArchivedError(name);
  });

export const getKrogerStatus = archived("getKrogerStatus");
export const setKrogerEnabled = archived("setKrogerEnabled");
export const ingestKrogerPrices = archived("ingestKrogerPrices");
export const testIngestKrogerPrices = archived("testIngestKrogerPrices");
export const listKrogerRuns = archived("listKrogerRuns");
export const getKrogerRun = archived("getKrogerRun");
export const getKrogerSignals = archived("getKrogerSignals");
export const listKrogerSkuMap = archived("listKrogerSkuMap");
export const searchIngredientReferences = archived("searchIngredientReferences");
export const confirmKrogerSkuMapping = archived("confirmKrogerSkuMapping");
export const listKrogerRunSkus = archived("listKrogerRunSkus");
export const getInventoryPriceSeries = archived("getInventoryPriceSeries");
export const listChartableItems = archived("listChartableItems");
export const listIngestDiagnostics = archived("listIngestDiagnostics");
export const runKrogerIngest = archived("runKrogerIngest");
