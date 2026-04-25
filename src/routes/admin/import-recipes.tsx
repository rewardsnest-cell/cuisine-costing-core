// ARCHIVED — Pricing v1 import-recipes page (used legacy importer + FRED seeding).
// See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/import-recipes")({
  head: () => ({ meta: [{ title: "Import Recipes (Archived)" }] }),
  component: ArchivedPage,
});

function ArchivedPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Import Recipes — Archived</h1>
      <p className="text-muted-foreground">
        The legacy recipe importer seeded archived pricing tables and has been
        retired alongside Pricing v1.
      </p>
    </div>
  );
}
