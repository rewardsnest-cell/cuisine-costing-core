import { useEffect, useState } from "react";
import { Loader2, Calculator, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCostBreakdown } from "@/lib/server-fns/cost-intelligence.functions";

type Breakdown = Awaited<ReturnType<typeof getCostBreakdown>>;

const fmt = (n: number | null | undefined, digits = 4) =>
  n == null || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toFixed(digits)}`;

export function CostBreakdownPanel({ referenceId }: { referenceId: string }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getCostBreakdown({ data: { reference_id: referenceId } })
      .then((d) => { if (alive) setData(d); })
      .catch((e: any) => { if (alive) setErr(e?.message || "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [referenceId]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading breakdown…</div>;
  }
  if (err || !data) {
    return <Alert variant="destructive"><AlertTriangle className="w-4 h-4" /><AlertDescription>{err || "No data"}</AlertDescription></Alert>;
  }

  const { item, sources, computed_estimate, stored_estimate, recipe_usage_count, pending_queue_entry } = data;
  const drift =
    computed_estimate != null && stored_estimate != null && stored_estimate !== 0
      ? ((computed_estimate - stored_estimate) / stored_estimate) * 100
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">{item.canonical_name}</h3>
          <p className="text-xs text-muted-foreground">
            {item.category ?? "uncategorized"} · canonical unit <span className="font-mono">{item.default_unit}</span> · used in {recipe_usage_count} recipe{recipe_usage_count === 1 ? "" : "s"}
          </p>
        </div>
        {item.manual_unit_cost != null && (
          <Badge variant="outline" className="text-xs">Manual override active</Badge>
        )}
      </div>

      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-primary">
            <Calculator className="w-4 h-4" />Internal Estimated Unit Cost
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-bold">{fmt(stored_estimate)}<span className="text-sm text-muted-foreground font-normal"> / {item.default_unit}</span></div>
          <p className="text-xs text-muted-foreground">
            Last calculated: {item.internal_estimated_unit_cost_updated_at ? new Date(item.internal_estimated_unit_cost_updated_at).toLocaleString() : "—"}
          </p>
          {computed_estimate != null && stored_estimate != null && Math.abs((stored_estimate - computed_estimate) / (stored_estimate || 1)) > 0.001 && (
            <p className="text-xs text-amber-600">
              Live recompute: {fmt(computed_estimate)} (drift {drift?.toFixed(2)}%)
            </p>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <div className="px-3 py-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Weighted calculation
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="text-left p-2">Source</th>
              <th className="text-right p-2">Value</th>
              <th className="text-right p-2">Default weight</th>
              <th className="text-right p-2">Applied weight</th>
              <th className="text-right p-2">Contribution</th>
              <th className="text-left p-2">Last updated</th>
            </tr>
          </thead>
          <tbody>
            <SourceRow
              label="Kroger (advisory)"
              src={sources.kroger}
              updatedAt={item.kroger_unit_cost_updated_at}
            />
            <SourceRow
              label="Manual / Local"
              src={sources.manual}
              updatedAt={item.manual_unit_cost_updated_at}
              highlight={item.manual_unit_cost != null}
            />
            <SourceRow
              label="Historical avg"
              src={sources.historical}
              updatedAt={item.historical_avg_updated_at}
            />
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30">
              <td colSpan={3} className="p-2 text-xs text-muted-foreground">
                Default weights: Kroger 40% · Manual 40% · Historical 20%. Missing sources have their weight redistributed proportionally.
              </td>
              <td className="p-2 text-right text-xs font-semibold">
                {(
                  sources.kroger.applied_weight +
                  sources.manual.applied_weight +
                  sources.historical.applied_weight
                ).toFixed(2)}
              </td>
              <td className="p-2 text-right font-bold">{fmt(computed_estimate)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {pending_queue_entry && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-xs">
            Pending update from <span className="font-medium">{pending_queue_entry.source}</span>:
            {" "}{fmt(pending_queue_entry.current_cost)} → {fmt(pending_queue_entry.proposed_cost)}
            {" "}({Number(pending_queue_entry.percent_change ?? 0).toFixed(2)}%) — review in Cost Update Queue.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-[11px] text-muted-foreground italic">
        Internal pricing intelligence — not customer-facing.
      </p>
    </div>
  );
}

function SourceRow({
  label,
  src,
  updatedAt,
  highlight,
}: {
  label: string;
  src: { value: number | null; available: boolean; base_weight: number; applied_weight: number };
  updatedAt: string | null;
  highlight?: boolean;
}) {
  const contribution = src.value != null ? src.value * src.applied_weight : null;
  return (
    <tr className={`border-b last:border-0 ${highlight ? "bg-primary/5" : ""}`}>
      <td className="p-2 font-medium">{label}</td>
      <td className="p-2 text-right">{src.value == null ? <span className="text-muted-foreground">—</span> : `$${src.value.toFixed(4)}`}</td>
      <td className="p-2 text-right text-muted-foreground">{Math.round(src.base_weight * 100)}%</td>
      <td className="p-2 text-right">
        {src.applied_weight === 0 ? <span className="text-muted-foreground">0%</span> : `${Math.round(src.applied_weight * 100)}%`}
      </td>
      <td className="p-2 text-right">{contribution == null ? <span className="text-muted-foreground">—</span> : `$${contribution.toFixed(4)}`}</td>
      <td className="p-2 text-xs text-muted-foreground">{updatedAt ? new Date(updatedAt).toLocaleDateString() : "—"}</td>
    </tr>
  );
}
