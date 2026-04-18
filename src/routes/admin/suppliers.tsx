import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Plus, Search, Truck, Globe, Phone, Smartphone, Tag, ChevronRight } from "lucide-react";

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

  const load = async () => {
    const { data } = await (supabase as any).from("suppliers").select("*").order("name");
    if (data) setSuppliers(data as Supplier[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
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
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) {
              setEditingId(null);
              setForm(EMPTY_FORM);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openAdd} className="bg-gradient-warm text-primary-foreground">
              <Plus className="w-4 h-4 mr-1" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
              <DialogDescription>Basic contact info. API & integration settings are on the supplier detail page.</DialogDescription>
            </DialogHeader>
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
            <Link
              key={s.id}
              to="/admin/suppliers/$id"
              params={{ id: s.id }}
              className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Open ${s.name}`}
            >
              <Card className="shadow-warm border-border/50 hover:shadow-gold hover:border-primary/40 transition-all h-full">
                <CardContent className="p-5 space-y-1">
                  <div className="flex justify-between items-start gap-3">
                    <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                    <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-1" />
                  </div>
                  {s.contact_name && <p className="text-sm text-muted-foreground">{s.contact_name}</p>}
                  {s.email && <p className="text-sm text-muted-foreground truncate">{s.email}</p>}
                  {s.website && (
                    <p className="text-sm text-primary flex items-center gap-1.5 truncate">
                      <Globe className="w-3.5 h-3.5 shrink-0" />{s.website.replace(/^https?:\/\//, "")}
                    </p>
                  )}
                  {s.office_phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />Office: {s.office_phone}
                    </p>
                  )}
                  {s.cellphone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />Cell: {s.cellphone}
                    </p>
                  )}
                  {s.phone && !s.office_phone && !s.cellphone && (
                    <p className="text-sm text-muted-foreground">{s.phone}</p>
                  )}
                  <div className="pt-2 text-xs text-primary font-medium inline-flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> View details & sale flyers
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
