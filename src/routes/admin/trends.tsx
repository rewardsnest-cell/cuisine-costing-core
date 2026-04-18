import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Minus, Search, LineChart as LineChartIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/trends")({
  component: TrendsPage,
});

type PricePoint = {
  inventory_item_id: string;
  unit_price: number;
  observed_at: string;
  source: string;
  supplier_id: string | null;
};

type InventoryItem = { id: string; name: string; unit: string; category: string | null };
type Supplier = { id: string; name: string };

type Trend = {
  item: InventoryItem;
  points: PricePoint[];
  first: number;
  last: number;
  min: number;
  max: number;
  pct: number;
  delta: number;
};

const RANGE_DAYS = { "30d": 30, "90d": 90, "180d": 180, "365d": 365, all: 100000 };

function TrendsPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<keyof typeof RANGE_DAYS>("90d");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"pct_desc" | "pct_asc" | "name">("pct_desc");
  const [detail, setDetail] = useState<Trend | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - RANGE_DAYS[range]);
      const [{ data: invData }, { data: supData }, { data: phData }] = await Promise.all([
        supabase.from("inventory_items").select("id, name, unit, category").order("name"),
        supabase.from("suppliers").select("id, name"),
        supabase
          .from("price_history")
          .select("inventory_item_id, unit_price, observed_at, source, supplier_id")
          .gte("observed_at", since.toISOString())
          .order("observed_at", { ascending: true })
          .limit(5000),
      ]);
      if (invData) setItems(invData as InventoryItem[]);
      if (supData) setSuppliers(supData as Supplier[]);
      if (phData) setHistory(phData as PricePoint[]);
    })();
  }, [range]);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "—";

  const trends: Trend[] = useMemo(() => {
    const byItem = new Map<string, PricePoint[]>();
    for (const p of history) {
      if (sourceFilter !== "all" && p.source !== sourceFilter) continue;
      if (!byItem.has(p.inventory_item_id)) byItem.set(p.inventory_item_id, []);
      byItem.get(p.inventory_item_id)!.push(p);
    }
    const out: Trend[] = [];
    for (const item of items) {
      const points = byItem.get(item.id) || [];
      if (points.length < 2) continue;
      const prices = points.map((p) => Number(p.unit_price));
      const first = prices[0];
      const last = prices[prices.length - 1];
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const pct = first > 0 ? ((last - first) / first) * 100 : 0;
      out.push({ item, points, first, last, min, max, pct, delta: last - first });
    }
    let filtered = out.filter((t) => t.item.name.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === "pct_desc") filtered.sort((a, b) => b.pct - a.pct);
    else if (sortBy === "pct_asc") filtered.sort((a, b) => a.pct - b.pct);
    else filtered.sort((a, b) => a.item.name.localeCompare(b.item.name));
    return filtered;
  }, [items, history, search, sourceFilter, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={range} onValueChange={(v: any) => setRange(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="180d">Last 6 months</SelectItem>
              <SelectItem value="365d">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="receipt">Receipts</SelectItem>
              <SelectItem value="purchase_order">Purchase orders</SelectItem>
              <SelectItem value="sale_flyer">Sale flyers</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pct_desc">Biggest increase</SelectItem>
              <SelectItem value="pct_asc">Biggest decrease</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {trends.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <LineChartIcon className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No price history yet for the selected range.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Process receipts, receive POs, or scan sale flyers to start building trends.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trends.map((t) => <TrendCard key={t.item.id} trend={t} onOpen={() => setDetail(t)} />)}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">{detail?.item.name} — Price history</DialogTitle></DialogHeader>
          {detail && <DetailChart trend={detail} supplierName={supplierName} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrendCard({ trend, onOpen }: { trend: Trend; onOpen: () => void }) {
  const up = trend.pct > 1;
  const down = trend.pct < -1;
  const color = up ? "text-destructive" : down ? "text-success" : "text-muted-foreground";
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const W = 240, H = 60;
  const prices = trend.points.map((p) => Number(p.unit_price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = W / (prices.length - 1);
  const path = prices.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(H - ((p - min) / range) * H).toFixed(1)}`).join(" ");

  return (
    <button onClick={onOpen} className="text-left">
      <Card className="hover:shadow-warm transition-shadow">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{trend.item.name}</p>
              <p className="text-xs text-muted-foreground">{trend.points.length} data points</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${color}`}>
              <Icon className="w-3.5 h-3.5" />
              {trend.pct >= 0 ? "+" : ""}{trend.pct.toFixed(1)}%
            </span>
          </div>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className={color} preserveAspectRatio="none">
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">${trend.first.toFixed(2)} → <span className="text-foreground font-medium">${trend.last.toFixed(2)}</span></span>
            <span className="text-muted-foreground">range ${trend.min.toFixed(2)}–${trend.max.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function DetailChart({ trend, supplierName }: { trend: Trend; supplierName: (id: string | null) => string }) {
  const W = 600, H = 200, PAD = 24;
  const prices = trend.points.map((p) => Number(p.unit_price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const xs = trend.points.map((p) => new Date(p.observed_at).getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xRange = xMax - xMin || 1;
  const x = (t: number) => PAD + ((t - xMin) / xRange) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const path = trend.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.observed_at).getTime()).toFixed(1)} ${y(Number(p.unit_price)).toFixed(1)}`).join(" ");

  return (
    <div className="space-y-4">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="text-primary">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" strokeOpacity="0.1" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" strokeOpacity="0.1" />
        <text x={PAD - 4} y={PAD + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity="0.5">${max.toFixed(2)}</text>
        <text x={PAD - 4} y={H - PAD + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity="0.5">${min.toFixed(2)}</text>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {trend.points.map((p, i) => (
          <circle key={i} cx={x(new Date(p.observed_at).getTime())} cy={y(Number(p.unit_price))} r="3" fill="currentColor" />
        ))}
      </svg>
      <div className="max-h-64 overflow-y-auto border-t border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Source</th>
              <th className="py-2 pr-2">Supplier</th>
              <th className="py-2 pr-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {[...trend.points].reverse().map((p, i) => (
              <tr key={i} className="border-b border-border/40">
                <td className="py-1.5 pr-2">{new Date(p.observed_at).toLocaleDateString()}</td>
                <td className="py-1.5 pr-2 capitalize">{p.source.replace("_", " ")}</td>
                <td className="py-1.5 pr-2 text-muted-foreground">{supplierName(p.supplier_id)}</td>
                <td className="py-1.5 pr-2 text-right font-medium">${Number(p.unit_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
