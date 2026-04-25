// ARCHIVED — Pricing v1 national snapshots. See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

export const insertNationalSnapshots = createServerFn({ method: "POST" }).handler(
  async () => {
    throw new LegacyPricingArchivedError("insertNationalSnapshots");
  },
);
