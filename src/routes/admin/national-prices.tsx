// ARCHIVED — Pricing v1 national prices. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";
import { LegacyArchivedBanner } from "@/components/admin/LegacyArchivedBanner";

export const Route = createFileRoute("/admin/national-prices")({
  component: ArchivedPage,
  head: () => ({ meta: [{ title: "National Prices (Archived)" }] }),
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8"><LegacyArchivedBanner />
      <h1 className="text-2xl font-bold mb-2">National Prices — Archived</h1>
      <p className="text-muted-foreground">
        This page belonged to Pricing v1. The national-price tables were moved
        to the <code className="mx-1">archive</code> schema. Pricing v2 will
        replace this workflow.
      </p>
    </div>
  );
}
