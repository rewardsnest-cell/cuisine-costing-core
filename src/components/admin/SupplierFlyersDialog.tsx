import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Trash2, Tag, CalendarRange, Sparkles, Package, FileText } from "lucide-react";
import { pdfFileToImageBlobs } from "@/lib/pdf-to-images";

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

type FlyerItem = {
  id: string;
  sale_flyer_id: string;
  inventory_item_id: string | null;
  name: string;
  brand: string | null;
  pack_size: string | null;
  unit: string | null;
  sale_price: number | null;
  regular_price: number | null;
  savings: number | null;
};

export function SupplierFlyersDialog({
  supplierId,
  supplierName,
  open,
  onOpenChange,
}: {
  supplierId: string | null;
  supplierName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [itemsByFlyer, setItemsByFlyer] = useState<Record<string, FlyerItem[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!supplierId) return;
    const { data: f } = await (supabase as any)
      .from("sale_flyers")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false });
    const flyersData = (f || []) as Flyer[];
    setFlyers(flyersData);

    if (flyersData.length > 0) {
      const ids = flyersData.map((x) => x.id);
      const { data: items } = await (supabase as any)
        .from("sale_flyer_items")
        .select("*")
        .in("sale_flyer_id", ids);
      const grouped: Record<string, FlyerItem[]> = {};
      (items || []).forEach((it: FlyerItem) => {
        (grouped[it.sale_flyer_id] ||= []).push(it);
      });
      setItemsByFlyer(grouped);
    } else {
      setItemsByFlyer({});
    }
  };

  useEffect(() => {
    if (open && supplierId) load();
  }, [open, supplierId]);

  const handleUpload = async (file: File) => {
    if (!supplierId) return;
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${supplierId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("sale-flyers").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("sale-flyers").getPublicUrl(path);
      const imageUrl = pub.publicUrl;

      const { data: inserted, error: insErr } = await (supabase as any)
        .from("sale_flyers")
        .insert({ supplier_id: supplierId, image_url: imageUrl, status: "pending" })
        .select()
        .single();
      if (insErr) throw insErr;

      await load();
      // Auto-process with AI
      processFlyer(inserted.id, imageUrl);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const processFlyer = async (flyerId: string, imageUrl: string) => {
    setProcessingId(flyerId);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("process-sale-flyer", {
        body: { flyerId, imageUrl },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      await load();
    } catch (e: any) {
      setError(e.message || "Processing failed");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (flyerId: string) => {
    if (!confirm("Delete this flyer and its extracted items?")) return;
    await (supabase as any).from("sale_flyers").delete().eq("id", flyerId);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" /> Sale Flyers — {supplierName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border border-dashed border-border/60 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">
              Upload a sale flyer image. AI will extract items, prices, and link to inventory.
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-gradient-warm text-primary-foreground gap-2 shrink-0"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Uploading..." : "Scan Flyer"}
            </Button>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded p-3">{error}</div>
          )}

          {flyers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No flyers yet for this supplier.
            </p>
          ) : (
            <div className="space-y-4">
              {flyers.map((fl) => {
                const items = itemsByFlyer[fl.id] || [];
                const isProcessing = processingId === fl.id;
                return (
                  <Card key={fl.id} className="border-border/60">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        {fl.image_url && (
                          <a
                            href={fl.image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full sm:w-32 h-32 shrink-0 rounded overflow-hidden bg-muted"
                          >
                            <img
                              src={fl.image_url}
                              alt={fl.title || "Sale flyer"}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        )}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {fl.title || "Untitled flyer"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Uploaded {new Date(fl.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={fl.status === "processed" ? "default" : "secondary"}>
                                {fl.status}
                              </Badge>
                              <button
                                onClick={() => handleDelete(fl.id)}
                                className="text-muted-foreground hover:text-destructive p-1"
                                aria-label="Delete flyer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {(fl.sale_start_date || fl.sale_end_date) && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarRange className="w-3 h-3" />
                              {fl.sale_start_date || "?"} → {fl.sale_end_date || "?"}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {fl.status !== "processed" && fl.image_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isProcessing}
                                onClick={() => processFlyer(fl.id, fl.image_url!)}
                                className="gap-1.5"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5" />
                                )}
                                {isProcessing ? "Extracting..." : "Extract with AI"}
                              </Button>
                            )}
                            {fl.status === "processed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isProcessing}
                                onClick={() => processFlyer(fl.id, fl.image_url!)}
                                className="gap-1.5"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5" />
                                )}
                                Re-extract
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {items.length > 0 && (
                        <div className="border-t border-border/60 pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            {items.length} item{items.length === 1 ? "" : "s"} on sale
                          </p>
                          <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {items.map((it) => (
                              <div
                                key={it.id}
                                className="flex items-center justify-between gap-3 text-sm border border-border/40 rounded px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    {it.name}
                                    {it.brand && (
                                      <span className="text-muted-foreground font-normal"> · {it.brand}</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                                    {it.pack_size && <span>{it.pack_size}</span>}
                                    {it.unit && <span>/ {it.unit}</span>}
                                    {it.inventory_item_id && (
                                      <span className="inline-flex items-center gap-1 text-primary">
                                        <Package className="w-3 h-3" /> linked
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  {typeof it.sale_price === "number" && (
                                    <p className="font-display font-bold">
                                      ${it.sale_price.toFixed(2)}
                                    </p>
                                  )}
                                  {typeof it.regular_price === "number" &&
                                    typeof it.sale_price === "number" &&
                                    it.regular_price > it.sale_price && (
                                      <p className="text-xs text-muted-foreground line-through">
                                        ${it.regular_price.toFixed(2)}
                                      </p>
                                    )}
                                </div>
                              </div>
                            ))}
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
      </DialogContent>
    </Dialog>
  );
}
