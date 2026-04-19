import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import { getPriceVolatilityAlerts } from "@/lib/server-fns/price-volatility.functions";
import { supabase } from "@/integrations/supabase/client";

type VolBar = { name: string; pct: number };
type CostPoint = { date: string; cost: number };

export function MarginVolatilityChart() {
  const fetchAlerts = useServerFn(getPriceVolatilityAlerts);
  const [vol, setVol] = useState<VolBar[]>([]);
  const [trend, setTrend] = useState<CostPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res: any = await fetchAlerts();
        const alerts = (res?.alerts || []) as Array<{ name: string; details: string }>;
        const parsed: VolBar[] = alerts
          .map((a) => {
            const m = a.details.match(/(-?\d+(?:\.\d+)?)%/);
            const pct = m ? parseFloat(m[1]) : 0;
            return { name: a.name.length > 18 ? a.name.slice(0, 16) + "…" : a.name, pct };
          })
          .filter((x) => Number.isFinite(x.pct))
          .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
          .slice(0, 10);
        setVol(parsed);

        // Recipe cost trend: sample avg cost_per_serving by month from price_history
        const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString();
        const { data: ph } = await supabase
          .from("price_history")
          .select("unit_price, observed_at")
          .gte("observed_at", since)
          .order("observed_at", { ascending: true })
          .limit(1000);

        const buckets = new Map<string, { sum: number; n: number }>();
        for (const r of ph || []) {
          const d = new Date(r.observed_at);
          const key = `${d.getMonth() + 1}/${d.getDate()}`;
          const cur = buckets.get(key) || { sum: 0, n: 0 };
          cur.sum += Number(r.unit_price) || 0;
          cur.n += 1;
          buckets.set(key, cur);
        }
        const points: CostPoint[] = Array.from(buckets.entries())
          .map(([date, v]) => ({ date, cost: Math.round((v.sum / v.n) * 100) / 100 }))
          .slice(-30);
        setTrend(points);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchAlerts]);

  const noVol = !loading && vol.length === 0;
  const noTrend = !loading && trend.length === 0;

  return (
    <Card className="shadow-warm border-border/50">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-display text-lg font-semibold">Margin Volatility</h3>
        </div>
        <Tabs defaultValue="ingredients">
          <TabsList className="mb-3">
            <TabsTrigger value="ingredients">Ingredient volatility</TabsTrigger>
            <TabsTrigger value="trend">Cost trend (90d)</TabsTrigger>
          </TabsList>
          <TabsContent value="ingredients">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : noVol ? (
              <EmptyState text="No price volatility detected — costs are stable." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={vol} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip
                    formatter={(v: any) => [`${v}%`, "Change"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                    {vol.map((entry, i) => (
                      <Cell key={i} fill={entry.pct >= 0 ? "hsl(var(--destructive))" : "hsl(var(--success))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </TabsContent>
          <TabsContent value="trend">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : noTrend ? (
              <EmptyState text="Not enough price history yet — keep logging receipts and POs." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="$" />
                  <Tooltip
                    formatter={(v: any) => [`$${v}`, "Avg unit price"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Avg unit price" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {text}
    </div>
  );
}

