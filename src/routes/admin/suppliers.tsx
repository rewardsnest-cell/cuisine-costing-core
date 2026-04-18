import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Trash2, Truck, Globe, Phone, Smartphone, Pencil, Tag } from "lucide-react";
import { SupplierFlyersDialog } from "@/components/admin/SupplierFlyersDialog";

export const Route = createFileRoute("/admin/suppliers")({
  component: SuppliersPage,
});

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  office_phone: string | null;
  cellphone: string | null;
};

const EMPTY_FORM = { name: "", contact_name: "", email: "", phone: "", address: "", website: "", office_phone: "", cellphone: "" };

function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [flyersFor, setFlyersFor] = useState<Supplier | null>(null);

  const load = async () => {
    const { data } = await (supabase as any).from("suppliers").select("*").order("name");
    if (data) setSuppliers(data as Supplier[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name ?? "",
      contact_name: s.contact_name ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      website: s.website ?? "",
      office_phone: s.office_phone ?? "",
      cellphone: s.cellphone ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      website: form.website || null,
      office_phone: form.office_phone || null,
      cellphone: form.cellphone || null,
    };
    if (editingId) {
      await (supabase as any).from("suppliers").update(payload).eq("id", editingId);
    } else {
      await (supabase as any).from("suppliers").insert(payload);
    }
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("suppliers").delete().eq("id", id);
    load();
  };

  const normalizeUrl = (u: string) => (u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setForm(EMPTY_FORM); } }}>
          <DialogTrigger asChild>
            <Button onClick={openAdd} className="bg-gradient-warm text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display">{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Company Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Contact Person</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div><Label>Website</Label><Input type="url" placeholder="https://example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Office Phone</Label><Input type="tel" value={form.office_phone} onChange={(e) => setForm({ ...form, office_phone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cellphone</Label><Input type="tel" value={form.cellphone} onChange={(e) => setForm({ ...form, cellphone: e.target.value })} /></div>
                <div><Label>Other Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <Button onClick={handleSave} className="w-full bg-gradient-warm text-primary-foreground" disabled={!form.name}>{editingId ? "Save Changes" : "Add Supplier"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <Truck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No suppliers yet. Add your first supplier.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className="shadow-warm border-border/50 hover:shadow-gold transition-shadow">
              <CardContent className="p-5 space-y-1">
                <div className="flex justify-between items-start">
                  <Link
                    to="/admin/suppliers/$id"
                    params={{ id: s.id }}
                    className="font-display text-lg font-semibold hover:text-primary transition-colors"
                  >
                    {s.name}
                  </Link>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(s)} className="text-muted-foreground hover:text-primary transition-colors p-1" aria-label="Edit supplier">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" aria-label="Delete supplier">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {s.contact_name && <p className="text-sm text-muted-foreground">{s.contact_name}</p>}
                {s.email && <p className="text-sm text-muted-foreground">{s.email}</p>}
                {s.website && (
                  <a href={normalizeUrl(s.website)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />{s.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {s.office_phone && (
                  <a href={`tel:${s.office_phone}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />Office: {s.office_phone}
                  </a>
                )}
                {s.cellphone && (
                  <a href={`tel:${s.cellphone}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />Cell: {s.cellphone}
                  </a>
                )}
                {s.phone && !s.office_phone && !s.cellphone && (
                  <p className="text-sm text-muted-foreground">{s.phone}</p>
                )}
                <div className="pt-2">
                  <Button asChild variant="outline" size="sm" className="gap-1.5 w-full">
                    <Link to="/admin/suppliers/$id" params={{ id: s.id }}>
                      <Tag className="w-3.5 h-3.5" /> View & Sale Flyers
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SupplierFlyersDialog
        supplierId={flyersFor?.id ?? null}
        supplierName={flyersFor?.name ?? ""}
        open={!!flyersFor}
        onOpenChange={(o) => { if (!o) setFlyersFor(null); }}
      />
    </div>
  );
}
