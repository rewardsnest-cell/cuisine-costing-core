import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tag, Search, ArrowUpDown, Truck, Calendar, Package, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/sales")({
  head: () => ({
    meta: [
      { title: "Sales Dashboard — VPS Finest" },
      { name: "description", content: "All currently active supplier sale prices, sortable by savings." },
    ],
  }),
  component: SalesDashboard,
});

type Row = {
  id: string;
  name: string;
  brand: string | null;
  pack_size: string | null;
  unit: string | null;
  pack_qty: number | null;
  pack_unit: string | null;
  price_per_unit: number | null;
  sale_price: number | null;
  regular_price: number | null;
  savings_pct: number | null;
  savings_amt: number | null;
  supplier_id: string | null;
  supplier_name: string;
  flyer_id: string;
  flyer_title: string | null;
  sale_start_date: string | null;
  sale_end_date: string | null;
  inventory_item_id: string | null;
  inventory_name: string | null;
  inventory_unit: string | null;
  current_stock: number | null;
  par_level: number | null;
  avg_cost: number | null;
  recipe_usage: number;
};

type SortKey = "savings_pct" | "sale_price" | "supplier_name" | "sale_end_date" | "price_per_unit";

// Parse "6.6 oz", "12 ct", "2 lb", "case of 24 / 12 oz" → { qty, unit }
function parsePack(pack: string | null, fallbackUnit: string | null): { qty: number | null; unit: string | null } {
  if (!pack) return { qty: null, unit: fallbackUnit };
  const cleaned = pack.toLowerCase().replace(/,/g, "");
  // Try last "<num> <unit>" occurrence (handles "case of 24 / 12 oz")
  const matches = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(oz|lb|lbs|kg|g|ml|l|ct|count|each|pk|pack|gal|qt|pt)\b/g)];
  if (matches.length > 0) {
    const m = matches[matches.length - 1];
    return { qty: parseFloat(m[1]), unit: m[2] };
  }
  const num = cleaned.match(/(\d+(?:\.\d+)?)/);
  return { qty: num ? parseFloat(num[1]) : null, unit: fallbackUnit };
}

function SalesDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("savings_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [flyerRes, recipeRes] = await Promise.all([
        (supabase as any)
          .from("sale_flyer_items")
          .select(`
            id, name, brand, pack_size, unit, sale_price, regular_price, inventory_item_id,
            sale_flyers!inner(id, title, status, sale_start_date, sale_end_date, supplier_id, suppliers(name)),
            inventory_items(name, unit, current_stock, par_level, average_cost_per_unit)
          `),
        (supabase as any)
          .from("recipe_ingredients")
          .select("inventory_item_id")
          .not("inventory_item_id", "is", null),
      ]);

      const usageMap = new Map<string, number>();
      for (const ri of (recipeRes.data || []) as any[]) {
        const k = ri.inventory_item_id as string;
        usageMap.set(k, (usageMap.get(k) || 0) + 1);
      }

      const out: Row[] = [];
      for (const r of (flyerRes.data || []) as any[]) {
        const f = r.sale_flyers;
        if (!f || f.status !== "processed") continue;
        if (f.sale_start_date && f.sale_start_date > today) continue;
        if (f.sale_end_date && f.sale_end_date < today) continue;
        const sale = r.sale_price != null ? Number(r.sale_price) : null;
        const reg = r.regular_price != null ? Number(r.regular_price) : null;
        const savings_amt = sale != null && reg != null && reg > sale ? reg - sale : null;
        const savings_pct = savings_amt != null && reg ? (savings_amt / reg) * 100 : null;
        const pack = parsePack(r.pack_size, r.unit);
        const ppu = sale != null && pack.qty && pack.qty > 0 ? sale / pack.qty : null;
        out.push({
          id: r.id,
          name: r.name,
          brand: r.brand,
          pack_size: r.pack_size,
          unit: r.unit,
          pack_qty: pack.qty,
          pack_unit: pack.unit,
          price_per_unit: ppu,
          sale_price: sale,
          regular_price: reg,
          savings_amt,
          savings_pct,
          supplier_id: f.supplier_id,
          supplier_name: f.suppliers?.name || "Unknown supplier",
          flyer_id: f.id,
          flyer_title: f.title,
          sale_start_date: f.sale_start_date,
          sale_end_date: f.sale_end_date,
          inventory_item_id: r.inventory_item_id,
          inventory_name: r.inventory_items?.name ?? null,
          inventory_unit: r.inventory_items?.unit ?? null,
          current_stock: r.inventory_items?.current_stock ?? null,
          par_level: r.inventory_items?.par_level ?? null,
          avg_cost: r.inventory_items?.average_cost_per_unit != null ? Number(r.inventory_items.average_cost_per_unit) : null,
          recipe_usage: r.inventory_item_id ? (usageMap.get(r.inventory_item_id) || 0) : 0,
        });
      }
      setRows(out);
      setLoading(false);
    })();
  }, []);

  const suppliers = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach(r => set.set(r.supplier_id || "_none", r.supplier_name));
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter(r => {
      if (supplierFilter !== "all" && (r.supplier_id || "_none") !== supplierFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.brand?.toLowerCase().includes(q)) ||
        r.supplier_name.toLowerCase().includes(q) ||
        (r.inventory_name?.toLowerCase().includes(q))
      );
    });
    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av: any = a[sortKey];
      const bv: any = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [rows, search, supplierFilter, sortKey, sortDir]);

  const totalSavings = filtered.reduce((s, r) => s + (r.savings_amt || 0), 0);
  const belowParCount = filtered.filter(r => r.current_stock != null && r.par_level != null && r.current_stock < r.par_level).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "supplier_name" || key === "sale_end_date" ? "asc" : "desc"); }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Active sale items" value={rows.length.toString()} icon={<Tag className="w-4 h-4 text-warm" />} />
        <SummaryCard label="Suppliers on sale" value={suppliers.length.toString()} icon={<Truck className="w-4 h-4 text-muted-foreground" />} />
        <SummaryCard label="Below par with sale" value={belowParCount.toString()} icon={<Package className="w-4 h-4 text-destructive" />} highlight={belowParCount > 0} />
        <SummaryCard label="Avg potential save / item" value={filtered.length ? `$${(totalSavings / filtered.length).toFixed(2)}` : "—"} icon={<Tag className="w-4 h-4 text-success" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search items, brands, suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split(":");
            setSortKey(k as SortKey);
            setSortDir(d as "asc" | "desc");
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="savings_pct:desc">Biggest % savings</option>
          <option value="price_per_unit:asc">Cheapest per unit</option>
          <option value="sale_price:asc">Lowest sale price</option>
          <option value="sale_end_date:asc">Ending soonest</option>
          <option value="supplier_name:asc">Supplier A→Z</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading active sales...</p>
      ) : filtered.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <Tag className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {rows.length === 0
                ? "No active sale flyers right now. Upload a flyer from a supplier to get started."
                : "No items match your filters."}
            </p>
            {rows.length === 0 && (
              <Link to="/admin/suppliers" className="inline-flex items-center gap-1 text-primary text-sm mt-3 hover:underline">
                Go to Suppliers <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const belowPar = r.current_stock != null && r.par_level != null && r.current_stock < r.par_level;
            const beatsAvg = r.avg_cost != null && r.price_per_unit != null && r.price_per_unit < r.avg_cost;
            const avgDiffPct = beatsAvg && r.avg_cost
              ? Math.round(((r.avg_cost - (r.price_per_unit as number)) / r.avg_cost) * 100)
              : null;
            return (
              <Card key={r.id} className="shadow-warm border-border/50">
                <CardContent className="p-4 space-y-3">
                  {/* Header: name + savings */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-tight">{r.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[r.brand, r.supplier_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {r.savings_pct != null && (
                      <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-success/10 text-success">
                        −{r.savings_pct.toFixed(0)}%
                      </span>
                    )}
                  </div>

                  {/* Pricing grid */}
                  <div className="grid grid-cols-3 gap-2 text-center bg-muted/30 rounded-md p-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sale</div>
                      <div className="text-base font-bold text-warm">
                        {r.sale_price != null ? `$${r.sale_price.toFixed(2)}` : "—"}
                      </div>
                      {r.regular_price != null && (
                        <div className="text-[10px] text-muted-foreground line-through">
                          ${r.regular_price.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="border-x border-border/50">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pack</div>
                      <div className="text-sm font-semibold">
                        {r.pack_qty != null ? `${r.pack_qty} ${r.pack_unit || ""}` : (r.pack_size || "—")}
                      </div>
                      {r.pack_size && r.pack_qty != null && (
                        <div className="text-[10px] text-muted-foreground truncate" title={r.pack_size}>
                          {r.pack_size}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Per {r.pack_unit || "unit"}</div>
                      <div className="text-base font-bold">
                        {r.price_per_unit != null ? `$${r.price_per_unit.toFixed(3)}` : "—"}
                      </div>
                      {avgDiffPct != null && (
                        <div className="text-[10px] text-success font-semibold">
                          beats avg −{avgDiffPct}%
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Ends {r.sale_end_date || "—"}
                    </span>
                    {r.savings_amt != null && (
                      <span>Save ${r.savings_amt.toFixed(2)}/pack</span>
                    )}
                    {r.recipe_usage > 0 && (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        Used in {r.recipe_usage} recipe{r.recipe_usage === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  {/* Inventory linkage */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs">
                    {r.inventory_item_id ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{r.inventory_name}</span>
                        {r.current_stock != null && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${belowPar ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                            {r.current_stock}{r.inventory_unit ? ` ${r.inventory_unit}` : ""}{r.par_level ? ` / par ${r.par_level}` : ""}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="italic text-muted-foreground">Not linked to inventory</span>
                    )}
                    <Link
                      to="/admin/suppliers/$id"
                      params={{ id: r.supplier_id || "" }}
                      className="text-primary font-medium hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      Flyer <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {belowParCount > 0 && (
        <Card className="border-gold/40 bg-gradient-to-br from-gold/5 to-transparent">
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm">
              <span className="font-semibold">{belowParCount}</span> sale item{belowParCount === 1 ? "" : "s"} are below par level — auto-suggest a PO from the Purchase Orders page.
            </p>
            <Link to="/admin/purchase-orders" className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1">
              Open Purchase Orders <ExternalLink className="w-3 h-3" />
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={`shadow-warm border-border/50 ${highlight ? "border-destructive/40" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}<span>{label}</span></div>
        <p className="text-2xl font-display font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SortHeader({ label, active, dir, onClick, align = "left" }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th className={`py-3 px-4 font-semibold text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
