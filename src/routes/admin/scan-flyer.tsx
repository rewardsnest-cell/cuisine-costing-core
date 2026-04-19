import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Loader2,
  Save,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { pdfFileToImageBlobs } from "@/lib/pdf-to-images";
import { compressImageBlob } from "@/lib/compress-image";
import { processSaleFlyer } from "@/lib/server-fns/process-sale-flyer.functions";

type Supplier = { id: string; name: string };

type StagedPage = {
  id: string;
  blob: Blob;
  ext: string;
  previewUrl: string;
  fromPdfPage?: number;
};

type SearchParams = { supplierId?: string };

export const Route = createFileRoute("/admin/scan-flyer")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    supplierId: typeof search.supplierId === "string" ? search.supplierId : undefined,
  }),
  component: ScanFlyerPage,
});

function ScanFlyerPage() {
  const navigate = useNavigate();
  const { supplierId: initialSupplierId } = useSearch({ from: "/admin/scan-flyer" });

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>(initialSupplierId ?? "");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pages, setPages] = useState<StagedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extractAfterSave, setExtractAfterSave] = useState(true);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("suppliers")
        .select("id,name")
        .order("name", { ascending: true });
      setSuppliers((data || []) as Supplier[]);
    })();
  }, []);

  // Revoke object URLs on unmount / when pages change
  useEffect(() => {
    return () => {
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const supplierName = useMemo(
    () => suppliers.find((s) => s.id === supplierId)?.name ?? "",
    [suppliers, supplierId],
  );

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const newPages: StagedPage[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          setStatus(`Rendering PDF ${i + 1}/${files.length}…`);
          const blobs = await pdfFileToImageBlobs(file);
          for (let idx = 0; idx < blobs.length; idx++) {
            const { blob, ext } = await compressImageBlob(blobs[idx]);
            newPages.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              blob,
              ext,
              previewUrl: URL.createObjectURL(blob),
              fromPdfPage: idx + 1,
            });
          }
        } else {
          setStatus(`Compressing photo ${i + 1}/${files.length}…`);
          const { blob, ext } = await compressImageBlob(file);
          newPages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            blob,
            ext,
            previewUrl: URL.createObjectURL(blob),
          });
        }
      }
      setPages((p) => [...p, ...newPages]);
    } catch (e: any) {
      setError(e.message || "Failed to add pictures");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const removePage = (id: string) => {
    setPages((ps) => {
      const target = ps.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return ps.filter((p) => p.id !== id);
    });
  };

  const movePage = (id: string, dir: -1 | 1) => {
    setPages((ps) => {
      const idx = ps.findIndex((p) => p.id === id);
      if (idx < 0) return ps;
      const target = idx + dir;
      if (target < 0 || target >= ps.length) return ps;
      const copy = [...ps];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const uploadOneBlob = async (blob: Blob, ext: string) => {
    const path = `${supplierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("sale-flyers")
      .upload(path, blob, { contentType: blob.type || `image/${ext}` });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("sale-flyers").getPublicUrl(path);
    return { url: pub.publicUrl, path };
  };

  const handleSave = async () => {
    if (!supplierId) {
      setError("Please pick a supplier first.");
      return;
    }
    if (pages.length === 0) {
      setError("Add at least one picture before saving.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setStatus(`Uploading ${pages.length} page${pages.length === 1 ? "" : "s"}…`);
      const uploaded = await Promise.all(pages.map((p) => uploadOneBlob(p.blob, p.ext)));

      setStatus("Creating flyer…");
      const { data: inserted, error: insErr } = await (supabase as any)
        .from("sale_flyers")
        .insert({
          supplier_id: supplierId,
          image_url: uploaded[0].url,
          status: "pending",
          title: title.trim() || null,
          sale_start_date: startDate || null,
          sale_end_date: endDate || null,
          notes: uploaded.length > 1 ? `${uploaded.length} pages` : null,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      const pageRows = uploaded.map((u, idx) => ({
        sale_flyer_id: inserted.id,
        page_number: idx + 1,
        image_url: u.url,
        storage_path: u.path,
      }));
      const { error: pagesErr } = await (supabase as any)
        .from("sale_flyer_pages")
        .insert(pageRows);
      if (pagesErr) throw pagesErr;

      if (extractAfterSave) {
        setStatus("Extracting items with AI…");
        try {
          const result = await processSaleFlyer({ data: { flyerId: inserted.id } });
          if (!result.success) {
            setError(`Saved, but AI extract failed: ${result.error || "unknown error"}`);
            setBusy(false);
            setStatus("");
            return;
          }
        } catch (fnErr: any) {
          setError(`Saved, but AI extract failed: ${fnErr?.message || fnErr}`);
          setBusy(false);
          setStatus("");
          return;
        }
      }

      // Clean previews and go back to suppliers
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      navigate({ to: "/admin/suppliers" });
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/suppliers">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="font-display text-2xl flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" /> Scan Flyer
          </h1>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="supplier">
                  <SelectValue placeholder="Choose supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={supplierName ? `${supplierName} weekly` : "Weekly flyer"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Sale start</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Sale end</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">Pictures</p>
              <p className="text-xs text-muted-foreground">
                Add as many pages as you want. Nothing is saved until you tap{" "}
                <strong>Save flyer</strong>.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {pages.length} page{pages.length === 1 ? "" : "s"}
            </span>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              addFiles(files);
              if (cameraRef.current) cameraRef.current.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              addFiles(files);
              if (galleryRef.current) galleryRef.current.value = "";
            }}
          />
          <input
            ref={filesRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              addFiles(files);
              if (filesRef.current) filesRef.current.value = "";
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="gap-2"
            >
              <Camera className="w-4 h-4" /> Take photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className="gap-2"
            >
              <ImageIcon className="w-4 h-4" /> Choose from gallery
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => filesRef.current?.click()}
              disabled={busy}
              className="gap-2"
            >
              <Upload className="w-4 h-4" /> Upload from files
            </Button>
          </div>

          {status && (
            <p className="text-xs text-primary font-medium flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> {status}
            </p>
          )}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded p-3">
              {error}
            </div>
          )}

          {pages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground border border-dashed rounded-lg py-8">
              No pictures added yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className="relative group border border-border/60 rounded-lg overflow-hidden bg-muted"
                >
                  <img
                    src={p.previewUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute top-1 left-1 text-[10px] bg-background/80 px-1.5 py-0.5 rounded">
                    p{idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePage(p.id)}
                    disabled={busy}
                    aria-label="Remove page"
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-1 right-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => movePage(p.id, -1)}
                      disabled={busy || idx === 0}
                      className="text-[10px] bg-background/80 px-1.5 py-0.5 rounded disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => movePage(p.id, 1)}
                      disabled={busy || idx === pages.length - 1}
                      className="text-[10px] bg-background/80 px-1.5 py-0.5 rounded disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between sticky bottom-0 bg-background/95 backdrop-blur border-t border-border/60 -mx-4 px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extractAfterSave}
            onChange={(e) => setExtractAfterSave(e.target.checked)}
            className="rounded border-border"
          />
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Extract items with AI after saving
        </label>
        <div className="flex flex-col items-stretch sm:items-end gap-1">
          <div className="flex gap-2">
            <Button asChild variant="ghost" disabled={busy}>
              <Link to="/admin/suppliers">Cancel</Link>
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="bg-gradient-warm text-primary-foreground gap-2"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {busy ? "Working…" : "Save flyer"}
            </Button>
          </div>
          {!supplierId && (
            <p className="text-xs text-muted-foreground">Pick a supplier before saving.</p>
          )}
          {supplierId && pages.length === 0 && (
            <p className="text-xs text-muted-foreground">Add at least one picture before saving.</p>
          )}
        </div>
      </div>
    </div>
  );
}
