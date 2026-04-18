import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Trash2, Tag, CalendarRange, Sparkles, Package, FileText, X } from "lucide-react";
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

type FlyerPage = {
  id: string;
  sale_flyer_id: string;
  page_number: number;
  image_url: string;
  storage_path: string | null;
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
  const [pagesByFlyer, setPagesByFlyer] = useState<Record<string, FlyerPage[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [addingPagesId, setAddingPagesId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addPagesRef = useRef<HTMLInputElement>(null);
  const addPagesFlyerIdRef = useRef<string | null>(null);

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
      const [{ data: items }, { data: pages }] = await Promise.all([
        (supabase as any).from("sale_flyer_items").select("*").in("sale_flyer_id", ids),
        (supabase as any)
          .from("sale_flyer_pages")
          .select("*")
          .in("sale_flyer_id", ids)
          .order("page_number", { ascending: true }),
      ]);
      const groupedItems: Record<string, FlyerItem[]> = {};
      (items || []).forEach((it: FlyerItem) => {
        (groupedItems[it.sale_flyer_id] ||= []).push(it);
      });
      const groupedPages: Record<string, FlyerPage[]> = {};
      (pages || []).forEach((p: FlyerPage) => {
        (groupedPages[p.sale_flyer_id] ||= []).push(p);
      });
      setItemsByFlyer(groupedItems);
      setPagesByFlyer(groupedPages);
    } else {
      setItemsByFlyer({});
      setPagesByFlyer({});
    }
  };

  useEffect(() => {
    if (open && supplierId) load();
  }, [open, supplierId]);

  const uploadOneBlob = async (blob: Blob, ext: string) => {
    if (!supplierId) throw new Error("No supplier");
    const path = `${supplierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("sale-flyers")
      .upload(path, blob, { contentType: blob.type || `image/${ext}` });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("sale-flyers").getPublicUrl(path);
    return { url: pub.publicUrl, path };
  };

  const handleUpload = async (files: File[]) => {
    if (!supplierId || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      // Expand: PDFs become one image per page; images stay as-is
      const allBlobs: { blob: Blob; ext: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          setUploadStatus(`Rendering PDF ${i + 1}/${files.length}…`);
          const pageBlobs = await pdfFileToImageBlobs(file);
          pageBlobs.forEach((b) => allBlobs.push({ blob: b, ext: "jpg" }));
        } else {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
          allBlobs.push({ blob: file, ext });
        }
      }

      if (allBlobs.length === 0) throw new Error("No pages to upload");

      // Upload all pages in parallel
      setUploadStatus(`Uploading ${allBlobs.length} page${allBlobs.length === 1 ? "" : "s"}…`);
      const uploaded = await Promise.all(allBlobs.map((b) => uploadOneBlob(b.blob, b.ext)));

      // Create flyer record (cover = first page)
      const { data: inserted, error: insErr } = await (supabase as any)
        .from("sale_flyers")
        .insert({
          supplier_id: supplierId,
          image_url: uploaded[0].url,
          status: "pending",
          notes: uploaded.length > 1 ? `${uploaded.length} pages` : null,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // Persist every page
      const pageRows = uploaded.map((u, idx) => ({
        sale_flyer_id: inserted.id,
        page_number: idx + 1,
        image_url: u.url,
        storage_path: u.path,
      }));
      const { error: pagesErr } = await (supabase as any).from("sale_flyer_pages").insert(pageRows);
      if (pagesErr) throw pagesErr;

      await load();
      setUploadStatus("Extracting with AI…");
      await processFlyer(inserted.id);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  const processFlyer = async (flyerId: string) => {
    setProcessingId(flyerId);
    setError(null);
    try {
      // Server fetches every page from sale_flyer_pages — no need to send URLs
      const { data, error: fnErr } = await supabase.functions.invoke("process-sale-flyer", {
        body: { flyerId },
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

  const addPagesToFlyer = async (flyerId: string, files: File[]) => {
    if (!supplierId || files.length === 0) return;
    setError(null);
    setAddingPagesId(flyerId);
    try {
      const allBlobs: { blob: Blob; ext: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          const pageBlobs = await pdfFileToImageBlobs(file);
          pageBlobs.forEach((b) => allBlobs.push({ blob: b, ext: "jpg" }));
        } else {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
          allBlobs.push({ blob: file, ext });
        }
      }
      if (allBlobs.length === 0) throw new Error("No pages to add");

      const uploaded = await Promise.all(allBlobs.map((b) => uploadOneBlob(b.blob, b.ext)));
      const existing = pagesByFlyer[flyerId] || [];
      const startNum = existing.reduce((m, p) => Math.max(m, p.page_number), 0) + 1;
      const pageRows = uploaded.map((u, idx) => ({
        sale_flyer_id: flyerId,
        page_number: startNum + idx,
        image_url: u.url,
        storage_path: u.path,
      }));
      const { error: pagesErr } = await (supabase as any)
        .from("sale_flyer_pages")
        .insert(pageRows);
      if (pagesErr) throw pagesErr;

      // Mark flyer back to pending so user can re-extract with new pages
      await (supabase as any)
        .from("sale_flyers")
        .update({ status: "pending" })
        .eq("id", flyerId);

      await load();
    } catch (e: any) {
      setError(e.message || "Failed to add pages");
    } finally {
      setAddingPagesId(null);
    }
  };

  const handleDelete = async (flyerId: string) => {
    if (!confirm("Delete this flyer and its extracted items?")) return;
    await (supabase as any).from("sale_flyers").delete().eq("id", flyerId);
    load();
  };

  const handleDeletePage = async (flyerId: string, page: FlyerPage) => {
    const remaining = (pagesByFlyer[flyerId] || []).length;
    if (remaining <= 1) {
      if (!confirm("This is the last page. Delete the entire flyer?")) return;
      await (supabase as any).from("sale_flyers").delete().eq("id", flyerId);
      load();
      return;
    }
    if (!confirm(`Delete page ${page.page_number}? You'll need to re-extract afterwards.`)) return;
    // Remove storage object (best-effort)
    if (page.storage_path) {
      await supabase.storage.from("sale-flyers").remove([page.storage_path]).catch(() => {});
    }
    await (supabase as any).from("sale_flyer_pages").delete().eq("id", page.id);

    // If we deleted the cover, promote next page to cover
    const flyer = flyers.find((f) => f.id === flyerId);
    if (flyer && flyer.image_url === page.image_url) {
      const next = (pagesByFlyer[flyerId] || []).find((p) => p.id !== page.id);
      if (next) {
        await (supabase as any)
          .from("sale_flyers")
          .update({ image_url: next.image_url })
          .eq("id", flyerId);
      }
    }
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
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>Upload one or more sale flyer pages (images or PDFs).</p>
              <p className="text-xs flex items-center gap-1">
                <FileText className="w-3 h-3" /> PDFs are split into pages automatically. On mobile, tap-and-hold or use "Select" to pick multiple photos — or use <strong>Add Pages</strong> on an existing flyer to append more.
              </p>
              {uploadStatus && (
                <p className="text-xs text-primary font-medium">{uploadStatus}</p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) handleUpload(files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-gradient-warm text-primary-foreground gap-2 shrink-0"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Working..." : "Scan Flyer"}
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
                const pages = pagesByFlyer[fl.id] || [];
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
                                Uploaded {new Date(fl.created_at).toLocaleDateString()} · {pages.length || 1} page{(pages.length || 1) === 1 ? "" : "s"}
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
                            {fl.status !== "processed" && pages.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isProcessing}
                                onClick={() => processFlyer(fl.id)}
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
                                onClick={() => processFlyer(fl.id)}
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

                      {pages.length > 1 && (
                        <div className="border-t border-border/60 pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Pages ({pages.length})
                          </p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {pages.map((p) => (
                              <div
                                key={p.id}
                                className="relative shrink-0 group"
                              >
                                <a
                                  href={p.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-20 h-20 rounded overflow-hidden bg-muted border border-border/40"
                                >
                                  <img
                                    src={p.image_url}
                                    alt={`Page ${p.page_number}`}
                                    className="w-full h-full object-cover"
                                  />
                                </a>
                                <span className="absolute bottom-0 left-0 text-[10px] bg-background/80 px-1 rounded-tr">
                                  p{p.page_number}
                                </span>
                                <button
                                  onClick={() => handleDeletePage(fl.id, p)}
                                  className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  aria-label={`Delete page ${p.page_number}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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
