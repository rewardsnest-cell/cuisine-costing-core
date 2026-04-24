import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, LineChart as LineChartIcon, ArrowLeft, Info, Tag } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { toast } from "sonner";
import {
  listChartableItems,
  getInventoryPriceSeries,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-price-signals")({
  head: () => ({ meta: [{ title: "Kroger Price Signals — Admin" }] }),
  component: KrogerPriceSignalsPage,
});

type ChartItem = Awaited<ReturnType<typeof listChartableItems>>[number];
type SeriesPoint = Awaited<ReturnType<typeof getInventoryPriceSeries>>[number];

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  kroger_api: { label: "Kroger", color: "hsl(var(--primary))" },
  receipt: { label: "Receipts", color: "hsl(var(--chart-2, 142 71% 45%))" },
  fred: { label: "FRED", color: "hsl(var(--chart-3, 217 91% 60%))" },
  competitor: { label: "Competitors", color: "hsl(var(--chart-4, 38 92% 50%))" },
  manual: { label: "Manual", color: "hsl(var(--muted-foreground))" },
};

function sourceMeta(s: string) {
  return SOURCE_LABELS[s] ?? { label: s, color: "hsl(var(--muted-foreground))" };
}

function KrogerPriceSignalsPage() {
  const [items, setItems] = useState<ChartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [days, setDays] = useState<30 | 90 | 180>(90);

  useEffect(() => {
    (async () => {
      setLoadingItems(true);
      try {
        const r = await listChartableItems({ data: { limit: 200 } });
        setItems(r);
        if (r.length && !selectedId) setSelectedId(r[0].id);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load items");
      } finally {
        setLoadingItems(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      setLoadingSeries(true);
      try {
        const r = await getInventoryPriceSeries({ data: { inventory_item_id: selectedId, days } });
        setSeries(r);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load price history");
      } finally {
        setLoadingSeries(false);
      }
    })();
  }, [selectedId, days]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items.slice(0, 100);
    return items.filter((i) => i.name.toLowerCase().includes(s)).slice(0, 100);
  }, [items, search]);

  const sourcesPresent = useMemo(() => {
    const set = new Set<string>();
    for (const p of series) set.add(p.source);
    return Array.from(set);
  }, [series]);

  // Build chart data: each row has timestamp + per-source unit_price
  const chartData = useMemo(() => {
    const sorted = [...series].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
    return sorted.map((p) => {
      const row: Record<string, any> = {
        t: new Date(p.observed_at).getTime(),
        label: new Date(p.observed_at).toLocaleDateString(),
      };
      row[p.source] = p.unit_price;
      return row;
    });
  }, [series]);

  // Recent points table
  const recent = useMemo(() => {
    return [...series].sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()).slice(0, 20);
  }, [series]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Kroger Price Signals</h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of how Kroger pricing compares to other sources for each inventory item. Per-unit normalized.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/kroger-pricing">
            <Button size="sm" variant="outline" className="gap-1"><ArrowLeft className="w-3.5 h-3.5" />Back to Kroger Pricing</Button>
          </Link>
        </div>
      </div>

      <Alert>
        <Info className="w-4 h-4" />
        <AlertDescription>
          This page is for inspection and insight only. No editing, no overrides. Promotional Kroger prices are marked but not emphasized.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChartIcon className="w-4 h-4" /> Per-unit price trends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-[280px_1fr] gap-4">
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter ingredients…"
                className="h-8 text-sm"
              />
              <div className="border rounded-md max-h-96 overflow-auto">
                {loadingItems ? (
                  <div className="p-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Loading…</div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">No items.</div>
                ) : filteredItems.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setSelectedId(i.id)}
                    className={`w-full text-left px-2 py-1.5 text-xs border-b last:border-0 hover:bg-muted ${selectedId === i.id ? "bg-muted font-medium" : ""}`}
                  >
                    <div className="truncate">{i.name}</div>
                    <div className="text-[10px] text-muted-foreground">avg ${Number(i.average_cost_per_unit ?? 0).toFixed(2)} / {i.unit}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm font-medium truncate">{selected?.name ?? "Select an ingredient"}</div>
                <div className="flex gap-1">
                  {([30, 90, 180] as const).map((d) => (
                    <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setDays(d)}>
                      {d}d
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                {sourcesPresent.length === 0 && !loadingSeries && <span className="text-xs text-muted-foreground">No sources in this window</span>}
                {sourcesPresent.map((s) => {
                  const meta = sourceMeta(s);
                  return (
                    <Badge key={s} variant="outline" className="gap-1 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </Badge>
                  );
                })}
              </div>

              <div className="h-80 border rounded-md p-2">
                {loadingSeries ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
                ) : chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No price history in this window.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        scale="time"
                        className="text-xs"
                      />
                      <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} className="text-xs" />
                      <Tooltip
                        labelFormatter={(v) => new Date(v as number).toLocaleDateString()}
                        formatter={(value: any, name: any) => [`$${Number(value).toFixed(4)}`, sourceMeta(String(name)).label]}
                      />
                      <Legend formatter={(v) => sourceMeta(String(v)).label} />
                      {sourcesPresent.map((s) => (
                        <Line
                          key={s}
                          type="monotone"
                          dataKey={s}
                          stroke={sourceMeta(s).color}
                          strokeWidth={s === "kroger_api" ? 2 : 1.5}
                          dot={{ r: 2 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent observations (per-unit)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSeries ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price history.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Observed</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((p, i) => {
                    const meta = sourceMeta(p.source);
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(p.observed_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 text-xs">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta.color }} />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${Number(p.unit_price).toFixed(4)}
                          {p.is_promo && (
                            <Badge variant="secondary" className="ml-2 text-[10px] gap-1"><Tag className="w-2.5 h-2.5" />promo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{p.unit ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                          {p.regular != null && <span>reg ${Number(p.regular).toFixed(2)}</span>}
                          {p.promo != null && <span className="ml-2">promo ${Number(p.promo).toFixed(2)}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
