import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LifecyclePanel } from "@/components/admin/exports/LifecyclePanel";
import { LegacyExportsPanel } from "@/components/admin/exports/LegacyExportsPanel";

export const Route = createFileRoute("/admin/exports")({
  head: () => ({
    meta: [
      { title: "Event Lifecycle & Exports — Admin" },
      {
        name: "description",
        content:
          "Run the customer → event → quote → invoice → receipt workflow, plus legacy CSV and audit exports.",
      },
    ],
  }),
  component: ExportsPage,
});

function ExportsPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Event Lifecycle &amp; Exports</h1>
        <p className="text-muted-foreground mt-1">
          Quotes don't exist in isolation — they exist because a customer is hosting an event.
          This hub enforces that linkage end-to-end.
        </p>
      </div>

      <Tabs defaultValue="lifecycle" className="w-full">
        <TabsList>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="legacy">Legacy Exports &amp; Audits</TabsTrigger>
        </TabsList>
        <TabsContent value="lifecycle" className="mt-4"><LifecyclePanel /></TabsContent>
        <TabsContent value="legacy" className="mt-4"><LegacyExportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
