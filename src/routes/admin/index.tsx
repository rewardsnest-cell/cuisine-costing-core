import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ChefHat, FileText, Receipt, TrendingUp, AlertTriangle, ShoppingCart, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

interface Stat {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  to: string;
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <Link to={stat.to} className="block">
      <Card className="shadow-warm border-border/50 hover:shadow-gold hover:border-primary/40 transition-all cursor-pointer h-full">
        <CardContent className="p-5 flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${stat.color}`}>
            <stat.icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold font-display">{stat.value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface LowStockItem {
  id: string;
  name: string;
  current_stock: number;
  par_level: number;
  unit: string;
}

interface RecentQuote {
  id: string;
  reference_number: string | null;
  client_name: string | null;
  event_type: string | null;
  total: number | null;
  created_at: string;
  status: string;
}

function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    recipes: 0,
    inventory: 0,
    quotes: 0,
    pendingReceipts: 0,
    suppliers: 0,
    purchaseOrders: 0,
  });
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);

  useEffect(() => {
    const load = async () => {
      const [
        recipesRes,
        inventoryRes,
        quotesRes,
        receiptsRes,
        suppliersRes,
        poRes,
        lowStockRes,
        recentQuotesRes,
      ] = await Promise.all([
        supabase.from("recipes").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("quotes").select("*", { count: "exact", head: true }),
        supabase.from("receipts").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("purchase_orders").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("id, name, current_stock, par_level, unit").gt("par_level", 0).order("name"),
        supabase.from("quotes").select("id, reference_number, client_name, event_type, total, created_at, status").order("created_at", { ascending: false }).limit(5),
      ]);

      setCounts({
        recipes: recipesRes.count ?? 0,
        inventory: inventoryRes.count ?? 0,
        quotes: quotesRes.count ?? 0,
        pendingReceipts: receiptsRes.count ?? 0,
        suppliers: suppliersRes.count ?? 0,
        purchaseOrders: poRes.count ?? 0,
      });
      setLowStock((lowStockRes.data || []).filter((i) => Number(i.current_stock) < Number(i.par_level)).slice(0, 5));
      setRecentQuotes(recentQuotesRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const stats: Stat[] = [
    { label: "Total Recipes", value: loading ? "…" : counts.recipes, icon: ChefHat, color: "bg-primary/10 text-primary", to: "/admin/recipes" },
    { label: "Inventory Items", value: loading ? "…" : counts.inventory, icon: Package, color: "bg-success/10 text-success", to: "/admin/inventory" },
    { label: "Total Quotes", value: loading ? "…" : counts.quotes, icon: FileText, color: "bg-gold/20 text-warm", to: "/admin/quotes" },
    { label: "Pending Receipts", value: loading ? "…" : counts.pendingReceipts, icon: Receipt, color: "bg-warning/20 text-warning", to: "/admin/receipts" },
    { label: "Suppliers", value: loading ? "…" : counts.suppliers, icon: Truck, color: "bg-accent/20 text-accent-foreground", to: "/admin/suppliers" },
    { label: "Purchase Orders", value: loading ? "…" : counts.purchaseOrders, icon: ShoppingCart, color: "bg-primary/10 text-primary", to: "/admin/purchase-orders" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-muted-foreground text-sm mt-1">Here's what's happening with your catering operations today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => <StatCard key={s.label} stat={s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <h3 className="font-display text-lg font-semibold">Recent Quotes</h3>
              </div>
              <Link to="/admin/quotes" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : recentQuotes.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                <p>No quotes yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentQuotes.map((q) => (
                  <li key={q.id}>
                    <Link to="/admin/quotes" className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{q.client_name || q.event_type || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{q.reference_number || "—"} · {q.status}</p>
                      </div>
                      <p className="text-sm font-semibold whitespace-nowrap">${Number(q.total || 0).toLocaleString()}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-warm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <h3 className="font-display text-lg font-semibold">Low Stock Alerts</h3>
              </div>
              <Link to="/admin/inventory" className="text-xs text-primary hover:underline">Manage</Link>
            </div>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : lowStock.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm text-center">
                <p>All inventory items are above par level.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {lowStock.map((item) => (
                  <li key={item.id}>
                    <Link to="/admin/inventory" className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-warning font-medium whitespace-nowrap">
                        {item.current_stock} / {item.par_level} {item.unit}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
