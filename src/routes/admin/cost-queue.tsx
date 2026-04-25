// ARCHIVED — Pricing v1 cost queue. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";
import { LegacyArchivedBanner } from "@/components/admin/LegacyArchivedBanner";

export const Route = createFileRoute("/admin/cost-queue")({
  component: ArchivedPage,
  head: () => ({ meta: [{ title: "Cost Update Queue (Archived)" }] }),
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8"><LegacyArchivedBanner />
      <h1 className="text-2xl font-bold mb-2">Cost Update Queue — Archived</h1>
      <p className="text-muted-foreground">
        This page belonged to Pricing v1 and has been archived. The
        <code className="mx-1">cost_update_queue</code> table moved to the
        <code className="mx-1">archive</code> schema and is read-only. Pricing v2
        will replace this workflow.
      </p>
    </div>
  );
}
