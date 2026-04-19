import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Globe, Phone, Smartphone, Mail, MapPin, User, Tag, Upload,
  CalendarRange, Truck, Loader2, Star, ExternalLink, Save, KeyRound, ChevronDown, ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/admin/suppliers/$id")({
  component: SupplierDetailPage,
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
  account_number: string | null;
  api_endpoint: string | null;
  api_username: string | null;
  api_key_secret_name: string | null;
  portal_url: string | null;
  payment_terms: string | null;
  delivery_days: string | null;
  notes: string | null;
};

type Flyer = {
  id: string;
  title: string | null;
  image_url: string | null;
  sale_start_date: string | null;
  sale_end_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

function isFlyerActive(f: Flyer): boolean {
  if (f.status !== "processed") return false;
  const today = new Date().toISOString().slice(0, 10);
  if (f.sale_start_date && f.sale_start_date > today) return false;
  if (f.sale_end_date && f.sale_end_date < today) return false;
  return true;
}

function SupplierDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: f }] = await Promise.all([
      (supabase as any).from("suppliers").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("sale_flyers").select("*").eq("supplier_id", id)
        .order("sale_start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ]);
    setSupplier((s as Supplier) ?? null);
    setForm((s as Supplier) ?? {});
    const flyersData = (f || []) as Flyer[];
    setFlyers(flyersData);
    if (flyersData.length > 0) {
      const { data: pages } = await (supabase as any).from("sale_flyer_pages")
        .select("sale_flyer_id").in("sale_flyer_id", flyersData.map((x) => x.id));
      const counts: Record<string, number> = {};
      (pages || []).forEach((p: any) => { counts[p.sale_flyer_id] = (counts[p.sale_flyer_id] || 0) + 1; });
      setPageCounts(counts);
    } else {
      setPageCounts({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const saveDetails = async () => {
    if (!supplier) return;
    setSaving(true);
    const payload = {
      account_number: form.account_number || null,
      api_endpoint: form.api_endpoint || null,
      api_username: form.api_username || null,
      api_key_secret_name: form.api_key_secret_name || null,
      portal_url: form.portal_url || null,
      payment_terms: form.payment_terms || null,
      delivery_days: form.delivery_days || null,
      notes: form.notes || null,
    };
    await (supabase as any).from("suppliers").update(payload).eq("id", supplier.id);
    setSaving(false);
    load();
  };

  const normalizeUrl = (u: string) =>
    u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="space-y-4">
        <Link to="/admin/suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to suppliers
        </Link>
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <Truck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Supplier not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Newest active flyer = the one shopping list will pull best costs from
  const activeFlyer = flyers.find(isFlyerActive) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin/suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to suppliers
        </Link>
        <Button
          onClick={() => navigate({ to: "/admin/scan-flyer", search: { supplierId: supplier.id } as any })}
          className="bg-gradient-warm text-primary-foreground gap-2"
        >
          <Upload className="w-4 h-4" /> Scan Flyer
        </Button>
      </div>

      {/* Contact card */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-6 space-y-3">
          <h1 className="font-display text-2xl font-semibold">{supplier.name}</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {supplier.contact_name && <div className="flex items-center gap-2 text-muted-foreground"><User className="w-4 h-4" /> {supplier.contact_name}</div>}
            {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Mail className="w-4 h-4" /> {supplier.email}</a>}
            {supplier.website && (
              <a href={normalizeUrl(supplier.website)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                <Globe className="w-4 h-4" /> {supplier.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {supplier.office_phone && <a href={`tel:${supplier.office_phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Phone className="w-4 h-4" /> Office: {supplier.office_phone}</a>}
            {supplier.cellphone && <a href={`tel:${supplier.cellphone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Smartphone className="w-4 h-4" /> Cell: {supplier.cellphone}</a>}
            {supplier.phone && !supplier.office_phone && !supplier.cellphone && (
              <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Phone className="w-4 h-4" /> {supplier.phone}</a>
            )}
            {supplier.address && <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2"><MapPin className="w-4 h-4" /> {supplier.address}</div>}
          </div>
        </CardContent>
      </Card>

      {/* Account & API integration */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-6 space-y-4">
          <button
            type="button"
            onClick={() => setShowApi((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Account & API Integration
            </h2>
            {showApi ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showApi && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Account Number</Label><Input value={form.account_number ?? ""} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="e.g. 1234567" /></div>
                <div><Label>Payment Terms</Label><Input value={form.payment_terms ?? ""} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="Net 30, COD, etc." /></div>
                <div><Label>Portal URL</Label><Input value={form.portal_url ?? ""} onChange={(e) => setForm({ ...form, portal_url: e.target.value })} placeholder="https://order.supplier.com" /></div>
                <div><Label>Delivery Days</Label><Input value={form.delivery_days ?? ""} onChange={(e) => setForm({ ...form, delivery_days: e.target.value })} placeholder="Mon, Wed, Fri" /></div>
                <div><Label>API Endpoint</Label><Input value={form.api_endpoint ?? ""} onChange={(e) => setForm({ ...form, api_endpoint: e.target.value })} placeholder="https://api.supplier.com/v1" /></div>
                <div><Label>API Username / Client ID</Label><Input value={form.api_username ?? ""} onChange={(e) => setForm({ ...form, api_username: e.target.value })} /></div>
                <div className="sm:col-span-2">
                  <Label>API Key Secret Name</Label>
                  <Input value={form.api_key_secret_name ?? ""} onChange={(e) => setForm({ ...form, api_key_secret_name: e.target.value })} placeholder="e.g. SYSCO_API_KEY" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Reference the name of a secret stored securely in Lovable Cloud. Never paste raw API keys here.
                  </p>
                </div>
                <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={saveDetails} disabled={saving} className="bg-gradient-warm text-primary-foreground gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </Button>
                {supplier.portal_url && (
                  <a href={normalizeUrl(supplier.portal_url)} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" /> Open Portal</Button>
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active flyer banner */}
      {activeFlyer && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Star className="w-5 h-5 text-primary fill-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Active flyer</p>
              <p className="text-xs text-muted-foreground truncate">
                {activeFlyer.title || "Untitled flyer"}
                {activeFlyer.sale_end_date && ` · ends ${activeFlyer.sale_end_date}`}
                {" · "}Used by Shopping List for best prices
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flyers list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" /> Sale Flyers
          </h2>
          <span className="text-xs text-muted-foreground">{flyers.length} total</span>
        </div>

        {flyers.length === 0 ? (
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-10 text-center">
              <Tag className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                No flyers yet. Tap <strong>Scan Flyer</strong> to add one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flyers.map((fl) => {
              const isActive = activeFlyer?.id === fl.id;
              return (
              <Card key={fl.id} className={`border-border/60 hover:shadow-gold transition-shadow overflow-hidden cursor-pointer ${isActive ? "ring-2 ring-primary" : ""}`} onClick={() => navigate({ to: "/admin/sale-flyers/$id", params: { id: fl.id } })}>
                  {fl.image_url && (
                    <div className="block w-full h-40 bg-muted">
                      <img src={fl.image_url} alt={fl.title || "Sale flyer"} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium truncate">{fl.title || "Untitled flyer"}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && <Badge className="bg-primary/15 text-primary border-primary/30">Active</Badge>}
                        <Badge variant={fl.status === "processed" ? "default" : "secondary"}>{fl.status}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {new Date(fl.created_at).toLocaleDateString()} · {pageCounts[fl.id] || 1} page{(pageCounts[fl.id] || 1) === 1 ? "" : "s"}
                    </p>
                    {(fl.sale_start_date || fl.sale_end_date) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarRange className="w-3 h-3" />
                        {fl.sale_start_date || "?"} → {fl.sale_end_date || "?"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
