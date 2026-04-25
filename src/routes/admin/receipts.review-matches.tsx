// ARCHIVED — Pricing v1 receipts review-matches page. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/receipts/review-matches")({
  head: () => ({ meta: [{ title: "Receipt Match Review (Archived)" }] }),
  component: ArchivedPage,
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Receipt Match Review — Archived</h1>
      <p className="text-muted-foreground">
        This workflow ran on top of Pricing v1's cost-intelligence pipeline,
        which has been archived.
      </p>
    </div>
  );
}
