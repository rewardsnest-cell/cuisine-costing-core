import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getFeatureFlags,
  setFeatureFlag,
  type FeatureFlag,
} from "@/lib/server-fns/feature-flags.functions";
import { getMarginVarianceRange } from "@/lib/server-fns/margin-reporting.functions";
import { getPriceVolatilityAlerts } from "@/lib/server-fns/price-volatility.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingState } from "@/components/LoadingState";
import { TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/margin-volatility")({
  head: () => ({
    meta: [
      { title: "Margin & Volatility — Admin" },
      {
        name: "description",
        content:
          "Quoted vs actual margin reporting and deterministic price volatility alerts.",
      },
    ],
  }),
  component: MarginVolatilityPage,
});

type Flags = Awaited<ReturnType<typeof getFeatureFlags>>;
type Range = Awaited<ReturnType<typeof getMarginVarianceRange>>;
type Alerts = Awaited<ReturnType<typeof getPriceVolatilityAlerts>>;

function MarginVolatilityPage() {
  const flagsFn = useServerFn(getFeatureFlags);
  const setFlagFn = useServerFn(setFeatureFlag);
  const rangeFn = useServerFn(getMarginVarianceRange);
  const alertsFn = useServerFn(getPriceVolatilityAlerts);

  const [flags, setFlags] = useState<Flags | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [f, r, a] = await Promise.all([
        flagsFn(),
        rangeFn({ data: {} }),
        alertsFn(),
      ]);
      setFlags(f);
      setRange(r);
      setAlerts(a);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(flag: FeatureFlag, enabled: boolean) {
    if (!flags) return;
    setFlags({ ...flags, [flag]: enabled });
    try {
      await setFlagFn({ data: { flag, enabled } });
    } catch (e: any) {
      setErr(e?.message || "Failed to save flag");
      setFlags({ ...flags, [flag]: !enabled });
    }
  }

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/margin-volatility" />
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-primary" /> Margin & Volatility
        </h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Quoted vs actual margin variance plus deterministic price alerts. All read-only.
        </p>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {flags &&
            (Object.keys(flags) as FeatureFlag[]).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <Label htmlFor={k} className="text-sm font-medium">
                  {k}
                </Label>
                <Switch
                  id={k}
                  checked={flags[k]}
                  onCheckedChange={(v) => toggle(k, v)}
                />
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margin Variance — All Events</CardTitle>
        </CardHeader>
        <CardContent>
          {!range || range.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No event data yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mb-4">
                <Stat label="Revenue" value={`$${range.totals.revenue.toFixed(2)}`} />
                <Stat label="Quoted Cost" value={`$${range.totals.quotedCost.toFixed(2)}`} />
                <Stat label="Actual Cost" value={`$${range.totals.actualCost.toFixed(2)}`} />
                <Stat
                  label="Variance"
                  value={`$${range.totals.variance.toFixed(2)}`}
                  tone={range.totals.variance > 0 ? "bad" : "good"}
                />
                <Stat
                  label="Variance %"
                  value={`${range.totals.variancePct}%`}
                  tone={range.totals.variancePct > 0 ? "bad" : "good"}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Ref</th>
                      <th className="py-2 pr-3">Event Date</th>
                      <th className="py-2 pr-3 text-right">Revenue</th>
                      <th className="py-2 pr-3 text-right">Quoted</th>
                      <th className="py-2 pr-3 text-right">Actual</th>
                      <th className="py-2 pr-3 text-right">Var</th>
                      <th className="py-2 pr-3 text-right">Var %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {range.rows.slice(0, 50).map((r: Range["rows"][number]) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="py-1.5 pr-3 font-mono text-xs">{r.reference_number || "—"}</td>
                        <td className="py-1.5 pr-3">{r.event_date}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">${r.revenue.toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">${r.quotedCost.toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">${r.actualCost.toFixed(2)}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums ${r.variance > 0 ? "text-destructive" : ""}`}>
                          ${r.variance.toFixed(2)}
                        </td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums ${r.variancePct > 0 ? "text-destructive" : ""}`}>
                          {r.variancePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> Price Volatility Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!alerts || alerts.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alerts. Active month: {alerts?.activeMonth || "—"}
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.alerts.map((a, i) => (
                <li
                  key={`${a.ingredient_id}-${i}`}
                  className="flex items-start gap-3 p-3 rounded-md border border-border"
                >
                  <Badge variant={a.severity === "high" ? "destructive" : "secondary"}>
                    {a.kind === "national_mom" ? "MoM" : "Local"}
                  </Badge>
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.details}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-medium tabular-nums ${
          tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
