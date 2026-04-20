import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShoppingCart, Trash2, ChevronDown, ChevronUp, Truck, Camera, Loader2, Sparkles, Tag, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useActiveSales, type ActiveSale } from "@/lib/use-active-sales";
import { useConfirm } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/admin/purchase-orders")({
  component: PurchaseOrdersPage,
});

type Supplier = { id: string; name: string };
type InventoryItem = { id: string; name: string; unit: string; average_cost_per_unit: number; current_stock: number; par_level: number; supplier_id: string | null };

type POItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  inventory_item_id: string | null;
};

type PO = {
  id: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  supplier_id: string | null;
};

function PurchaseOrdersPage() {
  const askConfirm = useConfirm();
  const [orders, setOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<Record<string, POItem[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ notes: "", expected_delivery: "", supplier_id: "" });
  const [itemForm, setItemForm] = useState({ inventory_item_id: "", name: "", quantity: "1", unit: "each", unit_price: "0" });
  type DraftLine = { inventory_item_id: string | null; name: string; quantity: number; unit: string; unit_price: number };
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [draftItem, setDraftItem] = useState({ inventory_item_id: "", name: "", quantity: "1", unit: "each", unit_price: "0" });
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [creatingSuggested, setCreatingSuggested] = useState(false);
  const [bulkAddingPO, setBulkAddingPO] = useState<string | null>(null);
  const { byItemId: activeSales } = useActiveSales();

  const addAllUnmatchedFromPO = async (poId: string) => {
    const lines = (items[poId] || []).filter((it) => !it.inventory_item_id && (it.name || "").trim().length > 0);
    if (lines.length === 0) {
      toast("No unmatched line items on this PO");
      return;
    }
    setBulkAddingPO(poId);
    let created = 0;
    let failed = 0;
    const poSupplier = orders.find((o) => o.id === poId)?.supplier_id || null;
    for (const line of lines) {
      const price = Number(line.unit_price) || 0;
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({
          name: line.name.trim(),
          unit: line.unit || "each",
          current_stock: 0,
          par_level: 0,
          average_cost_per_unit: price,
          last_receipt_cost: price > 0 ? price : null,
          supplier_id: poSupplier,
          created_source: "purchase_order",
        })
        .select("id")
        .single();
      if (error || !data) { failed++; continue; }
      const { error: linkErr } = await supabase
        .from("purchase_order_items")
        .update({ inventory_item_id: data.id })
        .eq("id", line.id);
      if (linkErr) { failed++; continue; }
      created++;
    }
    setBulkAddingPO(null);
    // Refresh inventory and this PO's items
    const { data: inv } = await supabase.from("inventory_items").select("*").order("name");
    if (inv) setInventory(inv as InventoryItem[]);
    await loadItems(poId);
    if (failed === 0) toast.success(`Added ${created} item${created === 1 ? "" : "s"} to inventory and linked`);
    else toast.warning(`Added ${created}, ${failed} failed`);
  };

  const handleScan = async (file: File) => {
    setScanning(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { processPurchaseOrder } = await import("@/lib/server-fns/process-purchase-order.functions");
      const data = await processPurchaseOrder({ data: { imageBase64: dataUrl } });
      if (!data?.success) throw new Error(data?.error || "Scan failed");

      // Try to match vendor by name
      let supplierId: string | null = null;
      if (data.vendor_name) {
        const match = suppliers.find((s) => s.name.toLowerCase().includes(String(data.vendor_name).toLowerCase()) || String(data.vendor_name).toLowerCase().includes(s.name.toLowerCase()));
        supplierId = match?.id || null;
      }

      // Create the PO
      const { data: poRow, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({ supplier_id: supplierId, notes: data.vendor_name ? `Scanned PO from ${data.vendor_name}` : "Scanned PO" })
        .select()
        .single();
      if (poErr || !poRow) throw poErr || new Error("Failed to create PO");

      // Insert line items, matching to inventory by name
      const items = (data.line_items || []).map((it: { name: string; quantity: number; unit: string; unit_price: number; total_price: number }) => {
        const nameLower = it.name.toLowerCase();
        const inv = inventory.find((i) => i.name.toLowerCase().includes(nameLower) || nameLower.includes(i.name.toLowerCase()));
        return {
          purchase_order_id: poRow.id,
          inventory_item_id: inv?.id || null,
          name: it.name,
          quantity: Number(it.quantity) || 0,
          unit: it.unit || inv?.unit || "each",
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || (Number(it.quantity) * Number(it.unit_price)) || 0,
        };
      });
      if (items.length > 0) {
        await supabase.from("purchase_order_items").insert(items);
        const total = items.reduce((s: number, r: { total_price: number }) => s + r.total_price, 0);
        await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", poRow.id);
      }

      toast.success(`Scanned ${items.length} item${items.length === 1 ? "" : "s"}`);
      await load();
      setExpanded(poRow.id);
      await loadItems(poRow.id);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to scan PO");
    } finally {
      setScanning(false);
    }
  };

  const load = async () => {
    const [ordersRes, supRes, invRes] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase.from("inventory_items").select("id, name, unit, average_cost_per_unit, current_stock, par_level, supplier_id").order("name"),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data as PO[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    if (invRes.data) setInventory(invRes.data as InventoryItem[]);
  };

  const loadItems = async (poId: string) => {
    const { data } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", poId);
    if (data) setItems((prev) => ({ ...prev, [poId]: data as POItem[] }));
  };

  useEffect(() => { load(); }, []);

  const resetDialog = () => {
    setDialogStep(1);
    setForm({ notes: "", expected_delivery: "", supplier_id: "" });
    setDraftLines([]);
    setDraftItem({ inventory_item_id: "", name: "", quantity: "1", unit: "each", unit_price: "0" });
  };

  const addDraftLine = () => {
    const qty = parseFloat(draftItem.quantity) || 0;
    const price = parseFloat(draftItem.unit_price) || 0;
    let name = draftItem.name.trim();
    let unit = draftItem.unit;
    let invId: string | null = draftItem.inventory_item_id || null;
    if (invId) {
      const inv = inventory.find((i) => i.id === invId);
      if (inv) { name = inv.name; unit = inv.unit; }
    }
    if (!name) { toast.error("Item name required"); return; }
    if (qty <= 0) { toast.error("Quantity must be > 0"); return; }
    setDraftLines((prev) => [...prev, { inventory_item_id: invId, name, quantity: qty, unit, unit_price: price }]);
    setDraftItem({ inventory_item_id: "", name: "", quantity: "1", unit: "each", unit_price: "0" });
  };

  const removeDraftLine = (idx: number) => {
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreatePO = async () => {
    if (!form.supplier_id) { toast.error("Pick a vendor"); return; }
    if (draftLines.length === 0) { toast.error("Add at least one line item"); return; }
    setCreatingDraft(true);
    try {
      const total = draftLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
      const { data: poRow, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          notes: form.notes || null,
          expected_delivery: form.expected_delivery || null,
          supplier_id: form.supplier_id,
          total_amount: total,
        })
        .select()
        .single();
      if (poErr || !poRow) throw poErr || new Error("Failed to create PO");
      const lineRows = draftLines.map((l) => ({
        purchase_order_id: poRow.id,
        inventory_item_id: l.inventory_item_id,
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        total_price: l.quantity * l.unit_price,
      }));
      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(lineRows);
      if (itemsErr) throw itemsErr;
      toast.success(`PO created with ${lineRows.length} item${lineRows.length === 1 ? "" : "s"}`);
      setDialogOpen(false);
      resetDialog();
      await load();
      setExpanded(poRow.id);
      await loadItems(poRow.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create PO");
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await askConfirm({
      title: "Delete this purchase order?",
      description: "All line items on this PO will be removed. This cannot be undone.",
    });
    if (!ok) return;
    await supabase.from("purchase_orders").delete().eq("id", id);
    load();
  };

  const toggleExpand = async (poId: string) => {
    if (expanded === poId) {
      setExpanded(null);
    } else {
      setExpanded(poId);
      if (!items[poId]) await loadItems(poId);
    }
  };

  const recalcTotal = async (poId: string) => {
    const { data } = await supabase.from("purchase_order_items").select("total_price").eq("purchase_order_id", poId);
    const total = (data || []).reduce((s, r: { total_price: number }) => s + Number(r.total_price), 0);
    await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", poId);
  };

  const addItem = async (poId: string) => {
    const qty = parseFloat(itemForm.quantity) || 0;
    const price = parseFloat(itemForm.unit_price) || 0;
    let name = itemForm.name;
    let unit = itemForm.unit;
    if (itemForm.inventory_item_id) {
      const inv = inventory.find((i) => i.id === itemForm.inventory_item_id);
      if (inv) { name = inv.name; unit = inv.unit; }
    }
    if (!name || qty <= 0) return;
    await supabase.from("purchase_order_items").insert({
      purchase_order_id: poId,
      inventory_item_id: itemForm.inventory_item_id || null,
      name,
      quantity: qty,
      unit,
      unit_price: price,
      total_price: qty * price,
    });
    setItemForm({ inventory_item_id: "", name: "", quantity: "1", unit: "each", unit_price: "0" });
    await loadItems(poId);
    await recalcTotal(poId);
    load();
  };

  const removeItem = async (poId: string, itemId: string) => {
    const ok = await askConfirm({
      title: "Remove this line item?",
      description: "It will be deleted from the purchase order.",
    });
    if (!ok) return;
    await supabase.from("purchase_order_items").delete().eq("id", itemId);
    await loadItems(poId);
    await recalcTotal(poId);
    load();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "received": return "bg-success/10 text-success";
      case "ordered": return "bg-gold/20 text-warm";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "No vendor";

  // Build suggestions: inventory items below par WITH an active sale flyer match.
  // Group by the SALE flyer's supplier (so we order from whoever has it on sale).
  type Suggestion = {
    inventory_item_id: string;
    name: string;
    unit: string;
    current_stock: number;
    par_level: number;
    suggested_qty: number;
    sale: ActiveSale;
  };
  const suggestionsBySupplier = (() => {
    const groups = new Map<string, { supplierName: string; supplierId: string | null; items: Suggestion[] }>();
    for (const inv of inventory) {
      if (!(inv.current_stock < inv.par_level)) continue;
      const sale = activeSales[inv.id];
      if (!sale) continue;
      const need = Math.max(1, Math.ceil(inv.par_level - inv.current_stock));
      const key = sale.supplier_name || "Unknown supplier";
      const supId = suppliers.find((s) => s.name === sale.supplier_name)?.id || null;
      if (!groups.has(key)) groups.set(key, { supplierName: key, supplierId: supId, items: [] });
      groups.get(key)!.items.push({
        inventory_item_id: inv.id,
        name: inv.name,
        unit: inv.unit,
        current_stock: inv.current_stock,
        par_level: inv.par_level,
        suggested_qty: need,
        sale,
      });
    }
    return Array.from(groups.values());
  })();

  const createSuggestedPO = async (group: { supplierName: string; supplierId: string | null; items: Suggestion[] }) => {
    setCreatingSuggested(true);
    try {
      const { data: poRow, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id: group.supplierId,
          notes: `Auto-suggested from active sale flyer (${group.supplierName})`,
        })
        .select()
        .single();
      if (poErr || !poRow) throw poErr || new Error("Failed to create PO");

      const lineItems = group.items.map((s) => ({
        purchase_order_id: poRow.id,
        inventory_item_id: s.inventory_item_id,
        name: s.name,
        quantity: s.suggested_qty,
        unit: s.unit,
        unit_price: s.sale.sale_price ?? 0,
        total_price: (s.sale.sale_price ?? 0) * s.suggested_qty,
      }));
      await supabase.from("purchase_order_items").insert(lineItems);
      const total = lineItems.reduce((sum, r) => sum + r.total_price, 0);
      await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", poRow.id);

      toast.success(`Draft PO created with ${lineItems.length} item${lineItems.length === 1 ? "" : "s"}`);
      await load();
      setExpanded(poRow.id);
      await loadItems(poRow.id);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to create suggested PO");
    } finally {
      setCreatingSuggested(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScan(f); e.target.value = ""; }}
          />
          <Button asChild variant="outline" disabled={scanning}>
            <span className="cursor-pointer">
              {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
              {scanning ? "Scanning..." : "Scan PO"}
            </span>
          </Button>
        </label>
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-gradient-warm text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> New PO</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">
                New Purchase Order {dialogStep === 1 ? "— Select Vendor" : `— ${supplierName(form.supplier_id)}`}
              </DialogTitle>
            </DialogHeader>

            {dialogStep === 1 ? (
              <div className="space-y-3">
                <div>
                  <Label>Vendor *</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button
                  onClick={() => {
                    if (!form.supplier_id) { toast.error("Pick a vendor"); return; }
                    setDialogStep(2);
                  }}
                  className="w-full bg-gradient-warm text-primary-foreground"
                >
                  Next: Add Items
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {draftLines.length > 0 ? (
                  <div className="rounded-md border border-border/60 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left py-1.5 px-2">Item</th>
                          <th className="text-right py-1.5 px-2">Qty</th>
                          <th className="text-left py-1.5 px-2">Unit</th>
                          <th className="text-right py-1.5 px-2">Price</th>
                          <th className="text-right py-1.5 px-2">Total</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftLines.map((l, i) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="py-1.5 px-2">{l.name}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{l.quantity}</td>
                            <td className="py-1.5 px-2 text-muted-foreground">{l.unit}</td>
                            <td className="py-1.5 px-2 text-right font-mono">${l.unit_price.toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-right font-mono">${(l.quantity * l.unit_price).toFixed(2)}</td>
                            <td className="py-1.5 px-2">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeDraftLine(i)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border/60 bg-muted/30">
                          <td colSpan={4} className="py-1.5 px-2 text-right text-xs text-muted-foreground">Total</td>
                          <td className="py-1.5 px-2 text-right font-display font-bold">
                            ${draftLines.reduce((s, l) => s + l.quantity * l.unit_price, 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No items yet — add your first line below.</p>
                )}

                <div className="rounded-md border border-dashed border-border/60 p-3 space-y-2">
                  <Label className="text-xs">Add Line Item</Label>
                  <Select
                    value={draftItem.inventory_item_id || "__custom__"}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setDraftItem({ ...draftItem, inventory_item_id: "" });
                      } else {
                        const inv = inventory.find((i) => i.id === v);
                        setDraftItem({
                          inventory_item_id: v,
                          name: inv?.name || "",
                          quantity: draftItem.quantity,
                          unit: inv?.unit || "each",
                          unit_price: inv ? String(inv.average_cost_per_unit || 0) : draftItem.unit_price,
                        });
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Pick from inventory or add custom" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__custom__">— Custom item —</SelectItem>
                      {inventory
                        .filter((i) => !form.supplier_id || !i.supplier_id || i.supplier_id === form.supplier_id)
                        .map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} ({i.unit}) {i.current_stock < i.par_level ? "· low" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {!draftItem.inventory_item_id && (
                    <Input
                      placeholder="Item name"
                      value={draftItem.name}
                      onChange={(e) => setDraftItem({ ...draftItem, name: e.target.value })}
                    />
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Qty</Label>
                      <Input type="number" step="0.01" value={draftItem.quantity} onChange={(e) => setDraftItem({ ...draftItem, quantity: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Unit</Label>
                      <Input value={draftItem.unit} onChange={(e) => setDraftItem({ ...draftItem, unit: e.target.value })} disabled={!!draftItem.inventory_item_id} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                      <Input type="number" step="0.01" value={draftItem.unit_price} onChange={(e) => setDraftItem({ ...draftItem, unit_price: e.target.value })} />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={addDraftLine} className="w-full">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add to PO
                  </Button>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogStep(1)} disabled={creatingDraft}>Back</Button>
                  <Button
                    onClick={handleCreatePO}
                    disabled={creatingDraft || draftLines.length === 0}
                    className="flex-1 bg-gradient-warm text-primary-foreground"
                  >
                    {creatingDraft ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1" />}
                    Create PO ({draftLines.length} item{draftLines.length === 1 ? "" : "s"})
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Suggested POs from active sale flyers */}
      {suggestionsBySupplier.length > 0 && (
        <Card className="shadow-warm border-gold/40 bg-gradient-to-br from-gold/5 to-transparent">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2">
                <Sparkles className="w-5 h-5 text-warm mt-0.5" />
                <div>
                  <h2 className="font-display text-lg font-semibold">Suggested Purchase Orders</h2>
                  <p className="text-xs text-muted-foreground">Items below par level that are currently on sale — order now while prices are low.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {suggestionsBySupplier.map((group) => {
                const groupTotal = group.items.reduce((s, it) => s + (it.sale.sale_price ?? 0) * it.suggested_qty, 0);
                return (
                  <div key={group.supplierName} className="rounded-lg border border-border/60 bg-background/60 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium text-sm">{group.supplierName}</p>
                        <span className="text-xs text-muted-foreground">· {group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-display font-bold">${groupTotal.toFixed(2)}</p>
                        <Button
                          size="sm"
                          className="bg-gradient-warm text-primary-foreground"
                          onClick={() => createSuggestedPO(group)}
                          disabled={creatingSuggested}
                        >
                          {creatingSuggested ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                          Create draft PO
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="py-1">Item</th>
                            <th className="py-1 text-right">Stock / Par</th>
                            <th className="py-1 text-right">Suggested Qty</th>
                            <th className="py-1 text-right">Sale Price</th>
                            <th className="py-1 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((it) => (
                            <tr key={it.inventory_item_id} className="border-t border-border/30">
                              <td className="py-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium">{it.name}</span>
                                  <span className="inline-flex items-center gap-0.5 text-warm">
                                    <Tag className="w-3 h-3" />
                                  </span>
                                  {it.sale.regular_price != null && it.sale.sale_price != null && it.sale.regular_price > it.sale.sale_price && (
                                    <span className="text-muted-foreground line-through">${it.sale.regular_price.toFixed(2)}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-1.5 text-right text-muted-foreground">{it.current_stock} / {it.par_level} {it.unit}</td>
                              <td className="py-1.5 text-right font-medium">{it.suggested_qty} {it.unit}</td>
                              <td className="py-1.5 text-right">${(it.sale.sale_price ?? 0).toFixed(2)}</td>
                              <td className="py-1.5 text-right font-medium">${((it.sale.sale_price ?? 0) * it.suggested_qty).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <ShoppingCart className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No purchase orders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((po) => {
            const isOpen = expanded === po.id;
            const poItems = items[po.id] || [];
            return (
              <Card key={po.id} className="shadow-warm border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <button onClick={() => toggleExpand(po.id)} className="text-muted-foreground hover:text-foreground">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">PO #{po.id.slice(0, 8)}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Truck className="w-3 h-3" /> {supplierName(po.supplier_id)} · Ordered {new Date(po.order_date).toLocaleDateString()}{po.expected_delivery ? ` · Due ${new Date(po.expected_delivery).toLocaleDateString()}` : ""}
                      </p>
                      {po.notes && <p className="text-sm text-muted-foreground mt-1">{po.notes}</p>}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(po.status)}`}>{po.status}</span>
                    <Select
                      value={po.status}
                      onValueChange={async (v) => {
                        await supabase.from("purchase_orders").update({ status: v }).eq("id", po.id);
                        if (v === "received") toast.success("PO received — inventory updated");
                        load();
                      }}
                    >
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="ordered">Ordered</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="font-display text-lg font-bold">${Number(po.total_amount).toFixed(2)}</p>
                    <button onClick={() => handleDelete(po.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Line Items</p>
                        {poItems.some((it) => !it.inventory_item_id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addAllUnmatchedFromPO(po.id)}
                            disabled={bulkAddingPO === po.id}
                            className="h-7 gap-1.5 text-xs"
                          >
                            {bulkAddingPO === po.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <PackagePlus className="w-3.5 h-3.5" />
                            )}
                            Add all unmatched to inventory
                          </Button>
                        )}
                      </div>
                      {poItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3">No items added yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                                <th className="py-2">Item</th>
                                <th className="py-2 text-right">Qty</th>
                                <th className="py-2">Unit</th>
                                <th className="py-2 text-right">Unit Cost</th>
                                <th className="py-2 text-right">Total</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {poItems.map((it) => (
                                <tr key={it.id} className="border-b border-border/30">
                                  <td className="py-2 font-medium">{it.name}</td>
                                  <td className="py-2 text-right">{it.quantity}</td>
                                  <td className="py-2 text-muted-foreground">{it.unit}</td>
                                  <td className="py-2 text-right">${Number(it.unit_price).toFixed(2)}</td>
                                  <td className="py-2 text-right font-medium">${Number(it.total_price).toFixed(2)}</td>
                                  <td className="py-2 text-right">
                                    <button onClick={() => removeItem(po.id, it.id)} className="text-muted-foreground hover:text-destructive">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-5">
                          <Label className="text-xs">Inventory Item</Label>
                          <Select value={itemForm.inventory_item_id} onValueChange={(v) => {
                            const inv = inventory.find((i) => i.id === v);
                            setItemForm({ ...itemForm, inventory_item_id: v, name: inv?.name || "", unit: inv?.unit || "each", unit_price: inv ? String(inv.average_cost_per_unit) : itemForm.unit_price });
                          }}>
                            <SelectTrigger><SelectValue placeholder="Pick item or type name" /></SelectTrigger>
                            <SelectContent>
                              {inventory.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {!itemForm.inventory_item_id && (
                            <Input className="mt-1" placeholder="Or custom name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
                          )}
                        </div>
                        <div className="md:col-span-2"><Label className="text-xs">Qty</Label><Input type="number" step="0.01" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} /></div>
                        <div className="md:col-span-2"><Label className="text-xs">Unit</Label><Input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} /></div>
                        <div className="md:col-span-2"><Label className="text-xs">Unit Cost</Label><Input type="number" step="0.01" value={itemForm.unit_price} onChange={(e) => setItemForm({ ...itemForm, unit_price: e.target.value })} /></div>
                        <div className="md:col-span-1"><Button size="sm" className="w-full bg-gradient-warm text-primary-foreground" onClick={() => addItem(po.id)}><Plus className="w-4 h-4" /></Button></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
