// ARCHIVED — Pricing v1 margin & volatility. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";
import { LegacyArchivedBanner } from "@/components/admin/LegacyArchivedBanner";

export const Route = createFileRoute("/admin/margin-volatility")({
  component: ArchivedPage,
  head: () => ({ meta: [{ title: "Margin & Volatility (Archived)" }] }),
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8"><LegacyArchivedBanner />
      <h1 className="text-2xl font-bold mb-2">Margin & Volatility — Archived</h1>
      <p className="text-muted-foreground">
        Pricing v1 charts depended on archived tables. Pricing v2 will replace
        this view.
      </p>
    </div>
  );
}
