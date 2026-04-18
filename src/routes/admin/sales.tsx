import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tag, Search, ArrowUpDown, Truck, Calendar, Package, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/sales")({
  head: () => ({
    meta: [
      { title: "Sales Dashboard — TasteQuote" },
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
  current_stock: number | null;
  par_level: number | null;
};

type SortKey = "savings_pct" | "sale_price" | "supplier_name" | "sale_end_date";

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
      const { data } = await (supabase as any)
        .from("sale_flyer_items")
        .select(`
          id, name, brand, pack_size, unit, sale_price, regular_price, inventory_item_id,
          sale_flyers!inner(id, title, status, sale_start_date, sale_end_date, supplier_id, suppliers(name)),
          inventory_items(name, current_stock, par_level)
        `);
      const out: Row[] = [];
      for (const r of (data || []) as any[]) {
        const f = r.sale_flyers;
        if (!f || f.status !== "processed") continue;
        if (f.sale_start_date && f.sale_start_date > today) continue;
        if (f.sale_end_date && f.sale_end_date < today) continue;
        const sale = r.sale_price != null ? Number(r.sale_price) : null;
        const reg = r.regular_price != null ? Number(r.regular_price) : null;
        const savings_amt = sale != null && reg != null && reg > sale ? reg - sale : null;
        const savings_pct = savings_amt != null && reg ? (savings_amt / reg) * 100 : null;
        out.push({
          id: r.id,
          name: r.name,
          brand: r.brand,
          pack_size: r.pack_size,
          unit: r.unit,
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
          current_stock: r.inventory_items?.current_stock ?? null,
          par_level: r.inventory_items?.par_level ?? null,
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
        <Card className="shadow-warm border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs">
                  <th className="py-3 px-4 font-semibold text-muted-foreground">Item</th>
                  <SortHeader label="Supplier" active={sortKey === "supplier_name"} dir={sortDir} onClick={() => toggleSort("supplier_name")} />
                  <th className="py-3 px-4 font-semibold text-muted-foreground text-right">Regular</th>
                  <SortHeader label="Sale" active={sortKey === "sale_price"} dir={sortDir} onClick={() => toggleSort("sale_price")} align="right" />
                  <SortHeader label="Savings" active={sortKey === "savings_pct"} dir={sortDir} onClick={() => toggleSort("savings_pct")} align="right" />
                  <SortHeader label="Ends" active={sortKey === "sale_end_date"} dir={sortDir} onClick={() => toggleSort("sale_end_date")} />
                  <th className="py-3 px-4 font-semibold text-muted-foreground">Inventory</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const belowPar = r.current_stock != null && r.par_level != null && r.current_stock < r.par_level;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.brand, r.pack_size, r.unit].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{r.supplier_name}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {r.regular_price != null ? `$${r.regular_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-warm">
                        {r.sale_price != null ? `$${r.sale_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {r.savings_pct != null ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success">
                            −{r.savings_pct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                        {r.savings_amt != null && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">save ${r.savings_amt.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {r.sale_end_date || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {r.inventory_item_id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{r.inventory_name}</span>
                            {belowPar && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive">
                                {r.current_stock}/{r.par_level} low
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unlinked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
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
