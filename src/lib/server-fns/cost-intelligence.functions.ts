// ARCHIVED — Pricing v1 cost intelligence. See /docs/pricing-archive.md.
// Stubs preserve the export surface so admin UIs that import these names keep
// compiling, but every call throws `LegacyPricingArchivedError`.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

const archived = (name: string) =>
  createServerFn({ method: "POST" }).handler(async () => {
    throw new LegacyPricingArchivedError(name);
  });

export const listIngredientCosts = archived("listIngredientCosts");
export const listCostUpdateQueue = archived("listCostUpdateQueue");
export const proposeCostUpdate = archived("proposeCostUpdate");
export const approveCostUpdate = archived("approveCostUpdate");
export const rejectCostUpdate = archived("rejectCostUpdate");
export const overrideCostUpdate = archived("overrideCostUpdate");
export const bulkApproveCostUpdates = archived("bulkApproveCostUpdates");
export const bulkRejectCostUpdates = archived("bulkRejectCostUpdates");
export const getCostBreakdown = archived("getCostBreakdown");
export const recomputeAndVerifyInternalCosts = archived("recomputeAndVerifyInternalCosts");
export const listLowConfidenceReceiptMatches = archived("listLowConfidenceReceiptMatches");
export const setReceiptLineItemMatch = archived("setReceiptLineItemMatch");
export const searchInventoryItemsForMatch = archived("searchInventoryItemsForMatch");
export const simulateApplyCostUpdates = archived("simulateApplyCostUpdates");
export const getCostQueueTimeline = archived("getCostQueueTimeline");
