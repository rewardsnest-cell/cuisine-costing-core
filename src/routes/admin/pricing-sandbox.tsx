import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlaskConical } from "lucide-react";

export const Route = createFileRoute("/admin/pricing-sandbox")({
  head: () => ({
    meta: [
      { title: "Pricing Sandbox — Internal" },
      { name: "description", content: "Try cost / margin / per-person scenarios without touching real quotes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PricingSandbox,
});

function PricingSandbox() {
  const [cost, setCost] = useState(1000);
  const [guests, setGuests] = useState(50);
  const [waste, setWaste] = useState(0.05);
  const [overhead, setOverhead] = useState(0.15);
  const [margin, setMargin] = useState(0.35);

  const results = useMemo(() => {
    const adjusted = cost * (1 + waste) * (1 + overhead);
    const total = margin >= 1 ? adjusted : adjusted / (1 - margin);
    return {
      adjusted, total,
      perPerson: total / Math.max(1, guests),
      costPerPerson: adjusted / Math.max(1, guests),
      profit: total - adjusted,
    };
  }, [cost, guests, waste, overhead, margin]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="font-display text-2xl font-bold mb-1 flex items-center gap-2">
        <FlaskConical className="w-6 h-6 text-primary" /> Pricing Sandbox
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Free-form what-if calculator. Nothing here writes to quotes, recipes, or any priced data.
      </p>

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Inputs</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div><Label className="text-xs">Raw food cost ($)</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </div>
          <div><Label className="text-xs">Guest count</Label>
            <Input type="number" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
          </div>
          <div><Label className="text-xs">Waste %</Label>
            <Input type="number" step="0.01" value={waste} onChange={(e) => setWaste(Number(e.target.value))} />
          </div>
          <div><Label className="text-xs">Overhead %</Label>
            <Input type="number" step="0.01" value={overhead} onChange={(e) => setOverhead(Number(e.target.value))} />
          </div>
          <div><Label className="text-xs">Target margin %</Label>
            <Input type="number" step="0.01" max={0.95} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Results</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Adjusted cost" v={`$${results.adjusted.toFixed(2)}`} />
          <Row k="Cost / person" v={`$${results.costPerPerson.toFixed(2)}`} />
          <Row k="Suggested total" v={`$${results.total.toFixed(2)}`} bold />
          <Row k="Suggested price / person" v={`$${results.perPerson.toFixed(2)}`} bold />
          <Row k="Profit" v={`$${results.profit.toFixed(2)}`} accent />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v, bold, accent }: { k: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "font-semibold border-t pt-2" : ""} ${accent ? "text-primary" : ""}`}>
      <span>{k}</span><span className="tabular-nums">{v}</span>
    </div>
  );
}
