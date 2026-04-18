import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Globe,
  Phone,
  Smartphone,
  Mail,
  MapPin,
  User,
  Tag,
  Upload,
  CalendarRange,
  Truck,
  Loader2,
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

type FlyerPage = {
  id: string;
  sale_flyer_id: string;
  page_number: number;
};

function SupplierDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: f }] = await Promise.all([
      (supabase as any).from("suppliers").select("*").eq("id", id).maybeSingle(),
      (supabase as any)
        .from("sale_flyers")
        .select("*")
        .eq("supplier_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setSupplier((s as Supplier) ?? null);
    const flyersData = (f || []) as Flyer[];
    setFlyers(flyersData);
    if (flyersData.length > 0) {
      const { data: pages } = await (supabase as any)
        .from("sale_flyer_pages")
        .select("sale_flyer_id")
        .in(
          "sale_flyer_id",
          flyersData.map((x) => x.id),
        );
      const counts: Record<string, number> = {};
      (pages || []).forEach((p: FlyerPage) => {
        counts[p.sale_flyer_id] = (counts[p.sale_flyer_id] || 0) + 1;
      });
      setPageCounts(counts);
    } else {
      setPageCounts({});
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/admin/suppliers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to suppliers
        </Link>
        <Button
          onClick={() => navigate({ to: "/admin/scan-flyer", search: { supplierId: supplier.id } })}
          className="bg-gradient-warm text-primary-foreground gap-2"
        >
          <Upload className="w-4 h-4" /> Scan Flyer
        </Button>
      </div>

      <Card className="shadow-warm border-border/50">
        <CardContent className="p-6 space-y-3">
          <h1 className="font-display text-2xl font-semibold">{supplier.name}</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {supplier.contact_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" /> {supplier.contact_name}
              </div>
            )}
            {supplier.email && (
              <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Mail className="w-4 h-4" /> {supplier.email}
              </a>
            )}
            {supplier.website && (
              <a
                href={normalizeUrl(supplier.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                <Globe className="w-4 h-4" /> {supplier.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {supplier.office_phone && (
              <a href={`tel:${supplier.office_phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="w-4 h-4" /> Office: {supplier.office_phone}
              </a>
            )}
            {supplier.cellphone && (
              <a href={`tel:${supplier.cellphone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Smartphone className="w-4 h-4" /> Cell: {supplier.cellphone}
              </a>
            )}
            {supplier.phone && !supplier.office_phone && !supplier.cellphone && (
              <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="w-4 h-4" /> {supplier.phone}
              </a>
            )}
            {supplier.address && (
              <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                <MapPin className="w-4 h-4" /> {supplier.address}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
            {flyers.map((fl) => (
              <Card key={fl.id} className="border-border/60 hover:shadow-gold transition-shadow overflow-hidden">
                {fl.image_url && (
                  <a href={fl.image_url} target="_blank" rel="noopener noreferrer" className="block w-full h-40 bg-muted">
                    <img
                      src={fl.image_url}
                      alt={fl.title || "Sale flyer"}
                      className="w-full h-full object-cover"
                    />
                  </a>
                )}
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium truncate">{fl.title || "Untitled flyer"}</p>
                    <Badge variant={fl.status === "processed" ? "default" : "secondary"}>
                      {fl.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {new Date(fl.created_at).toLocaleDateString()} ·{" "}
                    {pageCounts[fl.id] || 1} page{(pageCounts[fl.id] || 1) === 1 ? "" : "s"}
                  </p>
                  {(fl.sale_start_date || fl.sale_end_date) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarRange className="w-3 h-3" />
                      {fl.sale_start_date || "?"} → {fl.sale_end_date || "?"}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
