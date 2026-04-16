import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/purchase-orders")({
  component: PurchaseOrdersPage,
});

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
  const [orders, setOrders] = useState<PO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ notes: "", expected_delivery: "" });

  const load = async () => {
    const { data } = await supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as PO[]);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    await supabase.from("purchase_orders").insert({
      notes: form.notes || null,
      expected_delivery: form.expected_delivery || null,
    });
    setDialogOpen(false);
    setForm({ notes: "", expected_delivery: "" });
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("purchase_orders").delete().eq("id", id);
    load();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "received": return "bg-success/10 text-success";
      case "ordered": return "bg-gold/20 text-warm";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-warm text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> New PO</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">New Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleAdd} className="w-full bg-gradient-warm text-primary-foreground">Create PO</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {orders.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <ShoppingCart className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No purchase orders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((po) => (
            <Card key={po.id} className="shadow-warm border-border/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium">PO #{po.id.slice(0, 8)}</p>
                  <p className="text-sm text-muted-foreground">Ordered {new Date(po.order_date).toLocaleDateString()}{po.expected_delivery ? ` · Due ${new Date(po.expected_delivery).toLocaleDateString()}` : ""}</p>
                  {po.notes && <p className="text-sm text-muted-foreground mt-1">{po.notes}</p>}
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(po.status)}`}>{po.status}</span>
                <p className="font-display text-lg font-bold">${Number(po.total_amount).toFixed(2)}</p>
                <button onClick={() => handleDelete(po.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
