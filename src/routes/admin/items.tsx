// ARCHIVED — Pricing v1 items / cost-intelligence page. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/items")({
  head: () => ({ meta: [{ title: "Items (Archived) — Admin" }] }),
  component: ArchivedPage,
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Item & Cost Intelligence — Archived</h1>
      <p className="text-muted-foreground">
        This page belonged to Pricing v1 and depended on the archived{" "}
        <code>cost_update_queue</code> table. Pricing v2 will replace it.
      </p>
    </div>
  );
}
