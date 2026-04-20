import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { TrendingUp, FileSearch } from "lucide-react";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/competitor-trends")({
  head: () => ({
    meta: [
      { title: "Competitor Trends — Admin" },
      { name: "description", content: "Win rate and average price gap vs counter-quotes over time." },
    ],
  }),
  component: CompetitorTrendsPage,
});

type Row = {
  id: string;
  created_at: string;
  total: number | null;
  outcome: "pending" | "won" | "lost";
  counter_quote_id: string | null;
  counter_total: number | null;
};

type Range = "30d" | "90d" | "12m" | "all";

function startOfRange(range: Range): Date | null {
  const d = new Date();
  if (range === "30d") { d.setDate(d.getDate() - 30); return d; }
  if (range === "90d") { d.setDate(d.getDate() - 90); return d; }
  if (range === "12m") { d.setMonth(d.getMonth() - 12); return d; }
  return null;
}

function bucketKey(date: Date, granularity: "day" | "week" | "month") {
  if (granularity === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  if (granularity === "week") {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function CompetitorTrendsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("90d");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("competitor_quotes")
        .select("id,created_at,total,outcome,counter_quote_id,counter:quotes!competitor_quotes_counter_quote_id_fkey(total)")
        .order("created_at", { ascending: true });
      if (error) toast.error(error.message);
      else {
        setRows((data ?? []).map((d: any) => ({ ...d, counter_total: d.counter?.total ?? null })));
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const start = startOfRange(range);
    if (!start) return rows;
    return rows.filter((r) => new Date(r.created_at) >= start);
  }, [rows, range]);

  const granularity: "day" | "week" | "month" =
    range === "30d" ? "day" : range === "90d" ? "week" : "month";

  const chartData = useMemo(() => {
    const buckets = new Map<string, { won: number; lost: number; pending: number; gaps: number[] }>();
    for (const r of filtered) {
      const key = bucketKey(new Date(r.created_at), granularity);
      const b = buckets.get(key) ?? { won: 0, lost: 0, pending: 0, gaps: [] };
      b[r.outcome]++;
      const compTotal = Number(r.total ?? 0);
      const counterTotal = Number(r.counter_total ?? 0);
      if (compTotal > 0 && counterTotal > 0) b.gaps.push(counterTotal - compTotal);
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => {
        const decided = b.won + b.lost;
        const winRate = decided > 0 ? Math.round((b.won / decided) * 100) : 0;
        const avgGap = b.gaps.length ? b.gaps.reduce((s, n) => s + n, 0) / b.gaps.length : 0;
        return {
          period: key,
          won: b.won,
          lost: b.lost,
          pending: b.pending,
          winRate,
          avgGap: Math.round(avgGap),
        };
      });
  }, [filtered, granularity]);

  const overall = useMemo(() => {
    const won = filtered.filter((r) => r.outcome === "won").length;
    const lost = filtered.filter((r) => r.outcome === "lost").length;
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
    const gaps = filtered
      .filter((r) => Number(r.total ?? 0) > 0 && Number(r.counter_total ?? 0) > 0)
      .map((r) => Number(r.counter_total) - Number(r.total));
    const avgGap = gaps.length ? gaps.reduce((s, n) => s + n, 0) / gaps.length : 0;
    return { total: filtered.length, won, lost, winRate, avgGap, gapCount: gaps.length };
  }, [filtered]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/competitor-trends" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6" /> Competitor Trends
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Win rate and price gap vs our counter-quotes over time.</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-xs">Range</Label>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Link to="/admin/competitor-quotes">
            <Button variant="outline" className="gap-2"><FileSearch className="w-4 h-4" />View list</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Analyses" value={overall.total.toString()} />
        <Stat label="Won / Lost" value={`${overall.won} / ${overall.lost}`} />
        <Stat label="Win rate" value={`${overall.winRate}%`} tone={overall.winRate >= 50 ? "green" : "red"} />
        <Stat
          label={`Avg gap (${overall.gapCount})`}
          value={`${overall.avgGap >= 0 ? "+" : ""}${fmtMoney(overall.avgGap)}`}
          tone={overall.avgGap >= 0 ? "green" : "red"}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Win rate over time</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">No data in range.</div>
          ) : (
            <ChartContainer
              config={{
                won: { label: "Won", color: "hsl(142 70% 40%)" },
                lost: { label: "Lost", color: "hsl(0 70% 50%)" },
                winRate: { label: "Win rate %", color: "hsl(220 70% 50%)" },
              }}
              className="h-[280px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar yAxisId="left" dataKey="won" fill="var(--color-won)" stackId="o" />
                  <Bar yAxisId="left" dataKey="lost" fill="var(--color-lost)" stackId="o" />
                  <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="var(--color-winRate)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Average price gap vs counter</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground">No data in range.</div>
          ) : (
            <ChartContainer
              config={{ avgGap: { label: "Avg gap ($)", color: "hsl(280 60% 50%)" } }}
              className="h-[240px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avgGap" fill="var(--color-avgGap)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Positive = our counter-quote priced higher than the competitor. Negative = we undercut.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  const toneClass = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
