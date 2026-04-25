// ARCHIVED — Pricing v1 Kroger ingest tests retired with the pipeline.
// See /docs/pricing-archive.md.
import { describe, it, expect } from "vitest";
import { runKrogerIngestInternal } from "./kroger-ingest-internal";

describe("Kroger ingest (archived)", () => {
  it("throws LegacyPricingArchivedError when invoked", async () => {
    await expect(runKrogerIngestInternal()).rejects.toThrow(/archived/i);
  });
});
