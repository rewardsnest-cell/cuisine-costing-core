import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Package, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/admin/inventory")({
  component: InventoryPage,
});

type InventoryItem = {
  id: string;
  name: string;
  current_stock: number;
  unit: string;
  par_level: number;
  average_cost_per_unit: number;
  last_receipt_cost: number | null;
  category: string | null;
  supplier_id: string | null;
};

type Supplier = { id: string; name: string };

type PurchaseRow = {
  id: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  purchase_order_id: string;
  purchase_orders: { order_date: string; supplier_id: string | null } | null;
};

function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, PurchaseRow[]>>({});
  const [form, setForm] = useState({ name: "", unit: "each", par_level: "0", category: "", current_stock: "0", average_cost_per_unit: "0", supplier_id: "" });

  const loadItems = async () => {
    const [invRes, supRes] = await Promise.all([
      supabase.from("inventory_items").select("*").order("name"),
      supabase.from("suppliers").select("id, name").order("name"),
    ]);
    if (invRes.data) setItems(invRes.data as InventoryItem[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
  };

  useEffect(() => { loadItems(); }, []);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    await supabase.from("inventory_items").insert({
      name: form.name,
      unit: form.unit,
      par_level: parseFloat(form.par_level) || 0,
      category: form.category || null,
      current_stock: parseFloat(form.current_stock) || 0,
      average_cost_per_unit: parseFloat(form.average_cost_per_unit) || 0,
      supplier_id: form.supplier_id || null,
    });
    setDialogOpen(false);
    setForm({ name: "", unit: "each", par_level: "0", category: "", current_stock: "0", average_cost_per_unit: "0", supplier_id: "" });
    loadItems();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("inventory_items").delete().eq("id", id);
    loadItems();
  };

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "—";

  const loadHistory = async (itemId: string) => {
    const { data } = await supabase
      .from("purchase_order_items")
      .select("id, quantity, unit, unit_price, total_price, purchase_order_id, purchase_orders(order_date, supplier_id)")
      .eq("inventory_item_id", itemId)
      .order("purchase_order_id", { ascending: false });
    if (data) setHistory((prev) => ({ ...prev, [itemId]: data as unknown as PurchaseRow[] }));
  };

  const toggleExpand = async (itemId: string) => {
    if (expanded === itemId) setExpanded(null);
    else {
      setExpanded(itemId);
      if (!history[itemId]) await loadHistory(itemId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-warm text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Add Inventory Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div>
                <Label>Vendor</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Stock</Label><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></div>
                <div><Label>Par Level</Label><Input type="number" value={form.par_level} onChange={(e) => setForm({ ...form, par_level: e.target.value })} /></div>
                <div><Label>Avg Cost</Label><Input type="number" step="0.01" value={form.average_cost_per_unit} onChange={(e) => setForm({ ...form, average_cost_per_unit: e.target.value })} /></div>
              </div>
              <Button onClick={handleAdd} className="w-full bg-gradient-warm text-primary-foreground" disabled={!form.name}>Add Item</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No inventory items yet. Add your first item to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 px-2"></th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Name</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Vendor</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Stock</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Unit</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Par</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Avg Cost</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Last Cost</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.current_stock < item.par_level;
                const isOpen = expanded === item.id;
                const rows = history[item.id] || [];
                return (
                  <>
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-2">
                        <button onClick={() => toggleExpand(item.id)} className="text-muted-foreground hover:text-foreground">
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{supplierName(item.supplier_id)}</td>
                      <td className="py-3 px-4">{item.current_stock}</td>
                      <td className="py-3 px-4 text-muted-foreground">{item.unit}</td>
                      <td className="py-3 px-4 text-muted-foreground">{item.par_level}</td>
                      <td className="py-3 px-4">${Number(item.average_cost_per_unit).toFixed(2)}</td>
                      <td className="py-3 px-4 text-muted-foreground">{item.last_receipt_cost != null ? `$${Number(item.last_receipt_cost).toFixed(2)}` : "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isLow ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                          {isLow ? "Low Stock" : "OK"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/20">
                        <td></td>
                        <td colSpan={9} className="py-4 px-4">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Purchase History</p>
                          {rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No purchases recorded for this item yet.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1">Date</th>
                                  <th className="py-1">Vendor</th>
                                  <th className="py-1">PO</th>
                                  <th className="py-1 text-right">Qty</th>
                                  <th className="py-1">Unit</th>
                                  <th className="py-1 text-right">Unit Cost</th>
                                  <th className="py-1 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => (
                                  <tr key={r.id} className="border-t border-border/30">
                                    <td className="py-1.5">{r.purchase_orders?.order_date ? new Date(r.purchase_orders.order_date).toLocaleDateString() : "—"}</td>
                                    <td className="py-1.5">{supplierName(r.purchase_orders?.supplier_id ?? null)}</td>
                                    <td className="py-1.5 font-mono">#{r.purchase_order_id.slice(0, 8)}</td>
                                    <td className="py-1.5 text-right">{r.quantity}</td>
                                    <td className="py-1.5 text-muted-foreground">{r.unit}</td>
                                    <td className="py-1.5 text-right">${Number(r.unit_price).toFixed(2)}</td>
                                    <td className="py-1.5 text-right font-medium">${Number(r.total_price).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
