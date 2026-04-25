// ARCHIVED — Pricing v1 trends. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/trends")({
  component: ArchivedPage,
  head: () => ({ meta: [{ title: "Price Trends (Archived)" }] }),
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Price Trends — Archived</h1>
      <p className="text-muted-foreground">
        This page belonged to Pricing v1 and depended on the archived
        <code className="mx-1">price_history</code> table.
      </p>
    </div>
  );
}
