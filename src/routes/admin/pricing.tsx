// Pricing v2 — placeholder. Pricing v1 has been archived; this page will host
// the v2 controls once they're built. See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICING_ENGINE } from "@/lib/pricing-engine";

export const Route = createFileRoute("/admin/pricing")({
  head: () => ({ meta: [{ title: "Pricing — Admin" }] }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Pricing</h1>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline">Engine: {PRICING_ENGINE}</Badge>
          <Badge variant="secondary">v1 archived</Badge>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pricing v2 is being rebuilt</CardTitle>
          <CardDescription>
            The legacy Kroger / FRED / national-prices pipeline has been
            archived. Its tables now live in the read-only{" "}
            <code>archive</code> schema and are no longer queried by the app.
            See <code>/docs/pricing-archive.md</code> for the full list.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Pricing controls will return here once Pricing v2 lands.
        </CardContent>
      </Card>
    </div>
  );
}
