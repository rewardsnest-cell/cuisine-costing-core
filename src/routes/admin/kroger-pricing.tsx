import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, Activity, KeyRound, PlayCircle, Info, MapPin, LineChart as LineChartIcon, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  getKrogerStatus,
  setKrogerEnabled,
  setKrogerLocationId,
  ingestKrogerPrices,
  getKrogerSignals,
  listKrogerSkuMap,
  listChartableItems,
  getInventoryPriceSeries,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-pricing")({
  head: () => ({
    meta: [{ title: "Kroger Pricing — Admin" }],
  }),
  component: KrogerPricingPage,
});

type Status = Awaited<ReturnType<typeof getKrogerStatus>>;
type Signal = Awaited<ReturnType<typeof getKrogerSignals>>[number];
type SkuRow = Awaited<ReturnType<typeof listKrogerSkuMap>>[number];
type ChartItem = Awaited<ReturnType<typeof listChartableItems>>[number];
type SeriesPoint = Awaited<ReturnType<typeof getInventoryPriceSeries>>[number];

const FLAG_LABEL: Record<Signal["flag"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ok: { label: "OK", variant: "secondary" },
  no_signal: { label: "No signal", variant: "outline" },
  inventory_cheap: { label: "Inventory cheap vs Kroger", variant: "destructive" },
  inventory_expensive: { label: "Inventory expensive vs Kroger", variant: "destructive" },
  stale_inventory: { label: "Stale inventory", variant: "destructive" },
};

function KrogerPricingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [skuRows, setSkuRows] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, sig, skus] = await Promise.all([
        getKrogerStatus(),
        getKrogerSignals(),
        listKrogerSkuMap({ data: { limit: 50 } }),
      ]);
      setStatus(s);
      setSignals(sig);
      setSkuRows(skus);
      setLocationDraft(s.location_id ?? "");
    } catch (e: any) {
      toast.error(e?.message || "Failed to load Kroger status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await setKrogerEnabled({ data: { enabled } });
      toast.success(enabled ? "Kroger ingest enabled" : "Kroger ingest disabled");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update flag");
    } finally {
      setToggling(false);
    }
  };

  const onSaveLocation = async () => {
    setSavingLocation(true);
    try {
      const v = locationDraft.trim();
      await setKrogerLocationId({ data: { location_id: v || null } });
      toast.success(v ? `Location set to ${v}` : "Location cleared");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save location");
    } finally {
      setSavingLocation(false);
    }
  };

  const onRunIngest = async () => {
    setRunning(true);
    try {
      const res = await ingestKrogerPrices({ data: {} });
      if (res.ran) toast.success(res.message);
      else toast.message(res.message);
    } catch (e: any) {
      toast.error(e?.message || "Ingest failed");
    } finally {
      setRunning(false);
    }
  };

  const flaggedSignals = signals.filter((s) => s.flag !== "ok" && s.flag !== "no_signal");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Kroger Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Retail benchmark signal. Kroger data is <span className="font-medium">never</span> used to update inventory, recipe, or quote pricing —
            it only surfaces sanity checks for admins.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/kroger-runs"><Button size="sm" variant="outline" className="gap-1"><Activity className="w-3.5 h-3.5" />Runs</Button></Link>
          <Link to="/admin/kroger-sku-review"><Button size="sm" variant="outline" className="gap-1"><ListChecks className="w-3.5 h-3.5" />SKU Review</Button></Link>
        </div>
      </div>

      <Alert>
        <Info className="w-4 h-4" />
        <AlertTitle>Signal-only integration</AlertTitle>
        <AlertDescription>
          When enabled, Kroger prices land in <code>price_history</code> tagged <code>source=kroger_api</code>. They do not modify any
          inventory or recipe cost. Disabling the flag stops all ingestion immediately.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" /> Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !status ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={status.enabled} disabled={toggling} onCheckedChange={onToggle} />
                  <span className="text-sm font-medium">{status.enabled ? "Ingest enabled" : "Ingest disabled"}</span>
                </div>
                {status.keys_configured ? (
                  <Badge variant="secondary" className="gap-1"><KeyRound className="w-3 h-3" />API keys configured</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" />Missing: {status.missing_keys.join(", ")}</Badge>
                )}
                <Button size="sm" variant="outline" onClick={onRunIngest} disabled={running} className="gap-1">
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Queue ingest
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Stat label="Confirmed SKUs" value={status.mapped_skus} />
                <Stat label="Unmapped SKUs" value={status.unmapped_skus} />
                <Stat label="Price rows" value={status.price_history_rows} />
              </div>

              <div className="border-t pt-4 space-y-2">
                <Label htmlFor="loc" className="text-xs flex items-center gap-1.5"><MapPin className="w-3 h-3" />Catering area locationId (optional)</Label>
                <div className="flex gap-2 max-w-md">
                  <Input
                    id="loc"
                    value={locationDraft}
                    onChange={(e) => setLocationDraft(e.target.value)}
                    placeholder="e.g. 01400441"
                    className="h-9 font-mono text-sm"
                  />
                  <Button size="sm" onClick={onSaveLocation} disabled={savingLocation || locationDraft === (status.location_id ?? "")}>
                    {savingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  When set, product searches include <code>filter.locationId</code> so prices match your local Kroger store.
                  Leave blank for national pricing. Find a locationId via the Kroger Locations API.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <PriceHistoryCharts />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sanity-check signals (read-only)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : flaggedSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flagged items. {signals.length === 0 ? "No Kroger pricing data yet." : "All items align with Kroger 30-day median."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Inventory avg</TableHead>
                    <TableHead>Kroger 30d median</TableHead>
                    <TableHead>Samples</TableHead>
                    <TableHead>Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedSignals.map((s) => {
                    const f = FLAG_LABEL[s.flag];
                    return (
                      <TableRow key={s.inventory_item_id}>
                        <TableCell className="font-medium">{s.inventory_name} <span className="text-muted-foreground text-xs">/ {s.inventory_unit}</span></TableCell>
                        <TableCell>${Number(s.inventory_avg ?? 0).toFixed(2)}</TableCell>
                        <TableCell>{s.kroger_30d_median != null ? `$${Number(s.kroger_30d_median).toFixed(2)}` : "—"}</TableCell>
                        <TableCell>{s.kroger_sample_count}</TableCell>
                        <TableCell><Badge variant={f.variant}>{f.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">SKU mapping (recent)</CardTitle>
          <Link to="/admin/kroger-sku-review"><Button size="sm" variant="ghost" className="gap-1"><ListChecks className="w-3.5 h-3.5" />Open review</Button></Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : skuRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SKUs ingested yet. Once ingest runs, unmapped SKUs will appear here for confirmation.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuRows.slice(0, 25).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell>{r.product_name ?? "—"}</TableCell>
                      <TableCell><Badge variant={r.status === "confirmed" ? "secondary" : r.status === "unmapped" ? "outline" : "default"}>{r.status}</Badge></TableCell>
                      <TableCell>{r.match_confidence != null ? `${Math.round(Number(r.match_confidence) * 100)}%` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.last_seen_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function PriceHistoryCharts() {
  const [items, setItems] = useState<ChartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<30 | 90 | 180>(90);

  useEffect(() => {
    (async () => {
      try {
        const r = await listChartableItems({ data: { limit: 100 } });
        setItems(r);
        if (r.length && !selectedId) setSelectedId(r[0].id);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load items");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      setLoading(true);
      try {
        const r = await getInventoryPriceSeries({ data: { inventory_item_id: selectedId, days } });
        setSeries(r);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load series");
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedId, days]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items.slice(0, 50);
    return items.filter((i) => i.name.toLowerCase().includes(s)).slice(0, 50);
  }, [items, search]);

  const chartData = useMemo(() => {
    return series.map((p) => ({
      t: new Date(p.observed_at).getTime(),
      label: new Date(p.observed_at).toLocaleDateString(),
      kroger_regular: p.source === "kroger_api" ? (p.regular ?? null) : null,
      kroger_promo: p.source === "kroger_api" ? (p.promo ?? null) : null,
      kroger_observed: p.source === "kroger_api" ? p.unit_price : null,
      other: p.source !== "kroger_api" ? p.unit_price : null,
    }));
  }, [series]);

  const promoPoints = useMemo(
    () => series
      .filter((p) => p.source === "kroger_api" && p.is_promo)
      .map((p) => ({ t: new Date(p.observed_at).getTime(), price: p.unit_price })),
    [series],
  );

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChartIcon className="w-4 h-4" /> Price history trends
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter items…"
              className="h-8 text-sm"
            />
            <div className="border rounded-md max-h-72 overflow-auto">
              {filteredItems.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">No items.</div>
              ) : filteredItems.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  className={`w-full text-left px-2 py-1.5 text-xs border-b last:border-0 hover:bg-muted ${selectedId === i.id ? "bg-muted font-medium" : ""}`}
                >
                  <div className="truncate">{i.name}</div>
                  <div className="text-[10px] text-muted-foreground">${Number(i.average_cost_per_unit ?? 0).toFixed(2)} / {i.unit}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-medium truncate">{selected?.name ?? "Select an item"}</div>
              <div className="flex gap-1">
                {([30, 90, 180] as const).map((d) => (
                  <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setDays(d)}>
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-72 border rounded-md p-2">
              {loading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No price history in this window.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={56}
                    />
                    <Tooltip
                      labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                      formatter={(value: any, name: any) => [value == null ? "—" : `$${Number(value).toFixed(2)}`, name]}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="kroger_regular" name="Kroger regular" stroke="hsl(var(--primary))" dot={false} connectNulls strokeWidth={2} />
                    <Line type="monotone" dataKey="kroger_promo" name="Kroger promo" stroke="hsl(var(--destructive))" dot={{ r: 3 }} connectNulls strokeWidth={2} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="other" name="Other source" stroke="hsl(var(--muted-foreground))" dot={false} connectNulls strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            {promoPoints.length > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 bg-destructive" />
                {promoPoints.length} promo observation{promoPoints.length === 1 ? "" : "s"} highlighted (dashed line)
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
