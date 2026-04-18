import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Upload, FileImage, FileText, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pdfFileToImageBlobs } from "@/lib/pdf-to-images";
import { compressImageBlob } from "@/lib/compress-image";

type Mode = "per-file" | "packet";
type FileStatus = "queued" | "processing" | "done" | "error";
type Item = { id: string; file: File; status: FileStatus; message?: string };

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function fileToImageBlobs(file: File, opts: { maxPages?: number } = {}): Promise<Blob[]> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return await pdfFileToImageBlobs(file, { scale: 1.6, maxPages: opts.maxPages ?? 6 });
  }
  if (file.type.startsWith("image/")) {
    const c = await compressImageBlob(file, { maxEdge: 1800, quality: 0.85 });
    return [c.blob];
  }
  throw new Error("Unsupported file type — upload PDFs or images");
}

async function uploadToReceipts(blob: Blob): Promise<string> {
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `competitor/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("receipts").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("receipts").getPublicUrl(path).data.publicUrl;
}

async function analyzeBlob(blob: Blob) {
  const base64 = await blobToBase64(blob);
  const { data, error } = await supabase.functions.invoke("analyze-competitor-quote", {
    body: { imageBase64: base64, mimeType: blob.type || "image/jpeg" },
  });
  if (error) throw error;
  const result = (data as { result?: any })?.result ?? null;
  if (!result) throw new Error("No analysis returned");
  return result;
}

async function saveCompetitorRow(
  analysis: any,
  imageUrl: string,
  pages?: { image_url: string; storage_path?: string | null }[],
): Promise<string | null> {
  const insert: any = {
    analysis,
    source_image_url: imageUrl,
    competitor_name: analysis.competitorName ?? null,
    client_name: analysis.clientName ?? null,
    event_type: analysis.eventType ?? null,
    event_date: analysis.eventDate ?? null,
    guest_count: analysis.guestCount ?? null,
    per_guest_price: analysis.perGuestPrice ?? null,
    subtotal: analysis.subtotal ?? null,
    taxes: analysis.taxes ?? null,
    gratuity: analysis.gratuity ?? null,
    total: analysis.total ?? null,
    service_style: analysis.serviceStyle ?? null,
    outcome: "pending",
  };
  const { data: inserted, error } = await (supabase as any)
    .from("competitor_quotes")
    .insert(insert)
    .select("id")
    .single();
  if (error) throw error;
  const competitorQuoteId = inserted?.id ?? null;

  // Mirror to receipts (existing flow)
  await supabase.from("receipts").insert({
    image_url: imageUrl,
    total_amount: analysis.total ?? null,
    status: "pending",
    receipt_date: analysis.eventDate || new Date().toISOString().slice(0, 10),
    extracted_line_items: (analysis.lineItems ?? []) as any,
  });

  // Save individual pages (packet mode)
  if (competitorQuoteId && pages && pages.length > 0) {
    const rows = pages.map((p, i) => ({
      competitor_quote_id: competitorQuoteId,
      page_number: i + 1,
      image_url: p.image_url,
      storage_path: p.storage_path ?? null,
    }));
    await (supabase as any).from("competitor_quote_pages").insert(rows);
  }
  return competitorQuoteId;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

function mergeAnalyses(parts: any[]) {
  const out: any = {
    competitorName: null, clientName: null, eventType: null, eventDate: null,
    guestCount: null, perGuestPrice: null, subtotal: null, taxes: null, gratuity: null, total: null,
    serviceStyle: null, lineItems: [] as any[], menuHighlights: [] as string[], addons: [] as string[],
    notes: "",
  };
  for (const p of parts) {
    out.competitorName ??= p?.competitorName ?? null;
    out.clientName ??= p?.clientName ?? null;
    out.eventType ??= p?.eventType ?? null;
    out.eventDate ??= p?.eventDate ?? null;
    out.guestCount ??= p?.guestCount ?? null;
    out.perGuestPrice ??= p?.perGuestPrice ?? null;
    out.serviceStyle ??= p?.serviceStyle ?? null;
    // Sum numeric totals across pages
    for (const k of ["subtotal", "taxes", "gratuity", "total"] as const) {
      const v = Number(p?.[k] ?? 0);
      if (v > 0) out[k] = (Number(out[k] ?? 0)) + v;
    }
    if (Array.isArray(p?.lineItems)) out.lineItems.push(...p.lineItems);
    if (Array.isArray(p?.menuHighlights)) out.menuHighlights.push(...p.menuHighlights);
    if (Array.isArray(p?.addons)) out.addons.push(...p.addons);
    if (p?.notes) out.notes += (out.notes ? "\n\n" : "") + String(p.notes);
  }
  return out;
}

export function BulkCompetitorUpload({
  open, onOpenChange, onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("per-file");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setItems([]); setProgress(0); setRunning(false); };

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const next: Item[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f, status: "queued",
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const runPerFile = async () => {
    let done = 0; let created = 0; let failed = 0;
    for (const it of items) {
      updateItem(it.id, { status: "processing" });
      try {
        const blobs = await fileToImageBlobs(it.file, { maxPages: 1 });
        const blob = blobs[0];
        const imageUrl = await uploadToReceipts(blob);
        const analysis = await analyzeBlob(blob);
        await saveCompetitorRow(analysis, imageUrl);
        updateItem(it.id, { status: "done" });
        created++;
      } catch (e) {
        updateItem(it.id, { status: "error", message: e instanceof Error ? e.message : "Failed" });
        failed++;
      } finally {
        done++;
        setProgress(Math.round((done / items.length) * 100));
      }
    }
    if (created) toast.success(`Created ${created} competitor quote${created === 1 ? "" : "s"}`);
    if (failed) toast.error(`${failed} file${failed === 1 ? "" : "s"} failed`);
  };

  const runPacket = async () => {
    let done = 0; const total = items.length;
    const pageAnalyses: any[] = [];
    let firstImageUrl: string | null = null;
    for (const it of items) {
      updateItem(it.id, { status: "processing" });
      try {
        const blobs = await fileToImageBlobs(it.file, { maxPages: 6 });
        for (const blob of blobs) {
          const imageUrl = await uploadToReceipts(blob);
          if (!firstImageUrl) firstImageUrl = imageUrl;
          const analysis = await analyzeBlob(blob);
          pageAnalyses.push(analysis);
        }
        updateItem(it.id, { status: "done" });
      } catch (e) {
        updateItem(it.id, { status: "error", message: e instanceof Error ? e.message : "Failed" });
      } finally {
        done++;
        setProgress(Math.round((done / total) * 100));
      }
    }
    if (pageAnalyses.length === 0) {
      toast.error("No pages could be analyzed");
      return;
    }
    const merged = mergeAnalyses(pageAnalyses);
    try {
      await saveCompetitorRow(merged, firstImageUrl ?? "");
      toast.success(`Created 1 competitor quote from ${pageAnalyses.length} page${pageAnalyses.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save merged analysis");
    }
  };

  const start = async () => {
    if (items.length === 0) { toast.error("Add at least one file"); return; }
    setRunning(true);
    setProgress(0);
    try {
      if (mode === "per-file") await runPerFile();
      else await runPacket();
      onComplete?.();
    } finally {
      setRunning(false);
    }
  };

  const close = () => {
    if (running) return;
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk upload competitor quotes</DialogTitle>
          <DialogDescription>
            Add multiple PDFs or images, then choose whether each file is its own competitor quote or all files belong to one packet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="grid sm:grid-cols-2 gap-2 mt-1">
              <label className={`border rounded-md p-3 text-sm cursor-pointer ${mode === "per-file" ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="per-file" id="m1" />
                  <span className="font-medium">Each file = its own quote</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Best for analyzing several different competitor proposals at once.</p>
              </label>
              <label className={`border rounded-md p-3 text-sm cursor-pointer ${mode === "packet" ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="packet" id="m2" />
                  <span className="font-medium">All files = one packet</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Multi-page proposal — pages merge into a single competitor quote.</p>
              </label>
            </RadioGroup>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (running) return;
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/20"
          >
            <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-sm mt-2">Drop PDFs or images here, or</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => inputRef.current?.click()}
              disabled={running}
            >
              Choose files
            </Button>
          </div>

          {items.length > 0 && (
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {items.map((it) => {
                const isPdf = it.file.type === "application/pdf" || it.file.name.toLowerCase().endsWith(".pdf");
                const Icon = isPdf ? FileText : FileImage;
                return (
                  <div key={it.id} className="flex items-center gap-3 p-2 text-sm">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{it.file.name}</p>
                      {it.message && <p className="text-xs text-red-600 truncate">{it.message}</p>}
                    </div>
                    {it.status === "queued" && !running && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(it.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    {it.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {it.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {it.status === "error" && <AlertCircle className="w-4 h-4 text-red-600" />}
                  </div>
                );
              })}
            </div>
          )}

          {running && <Progress value={progress} className="h-2" />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={running}>Close</Button>
          <Button onClick={start} disabled={running || items.length === 0}>
            {running ? "Processing…" : `Analyze ${items.length || ""} file${items.length === 1 ? "" : "s"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
