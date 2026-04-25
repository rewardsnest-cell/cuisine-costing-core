// ARCHIVED — Pricing v1 Kroger ingest. See /docs/pricing-archive.md.
import { LegacyPricingArchivedError } from "@/lib/pricing-engine";

export type KrogerIngestResult = {
  run_id: string | null;
  status: "skipped";
  location_id: string | null;
  message: string;
};

export async function runKrogerIngestInternal(_opts?: unknown): Promise<KrogerIngestResult> {
  throw new LegacyPricingArchivedError("runKrogerIngestInternal");
}
