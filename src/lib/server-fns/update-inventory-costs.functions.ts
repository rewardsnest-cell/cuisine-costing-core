// ARCHIVED — Pricing v1. This module is retained only so legacy imports keep
// resolving. All exports throw `LegacyPricingArchivedError` at runtime.
// See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

const archived = (name: string) =>
  createServerFn({ method: "POST" }).handler(async () => {
    throw new LegacyPricingArchivedError(name);
  });

export const updateInventoryCosts = archived("updateInventoryCosts");
