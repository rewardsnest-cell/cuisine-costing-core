import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt, Upload, CheckCircle, Clock, FileText, Scan, ArrowRight, Loader2, Plus, Trash2, Pencil, PackagePlus, AlertTriangle, RefreshCw, Settings, Save, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const lineItemSchema = z.object({
  item_name: z
    .string()
    .trim()
    .min(1, "Name required")
    .max(200, "Max 200 chars"),
  quantity: z
    .number({ invalid_type_error: "Number" })
    .finite("Invalid")
    .gt(0, "Must be > 0")
    .max(100000, "Too large"),
  unit: z
    .string()
    .trim()
    .min(1, "Unit required")
    .max(20, "Max 20 chars"),
  unit_price: z
    .number({ invalid_type_error: "Number" })
    .finite("Invalid")
    .min(0, "Must be ≥ 0")
    .max(1000000, "Too large"),
});

type LineItemErrors = Partial<Record<"item_name" | "quantity" | "unit" | "unit_price", string>>;

function validateLineItems(items: LineItem[]): { errors: Record<number, LineItemErrors>; firstMessage: string | null } {
  const errors: Record<number, LineItemErrors> = {};
  let firstMessage: string | null = null;
  items.forEach((it, idx) => {
    const result = lineItemSchema.safeParse({
      item_name: it.item_name,
      quantity: Number(it.quantity),
      unit: it.unit,
      unit_price: Number(it.unit_price),
    });
    if (!result.success) {
      const rowErrors: LineItemErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LineItemErrors;
        if (field && !rowErrors[field]) rowErrors[field] = issue.message;
        if (!firstMessage) firstMessage = `Row ${idx + 1}: ${issue.message}`;
      }
      errors[idx] = rowErrors;
    }
  });
  return { errors, firstMessage };
}

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/receipts")({
  component: ReceiptsPage,
});

type LineItem = {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  matched_inventory_id: string | null;
  matched_inventory_name: string | null;
  match_source?: string | null;
  match_score?: number | null;
  needs_review?: boolean;
  review_reason?: string | null;
};

type ReceiptRow = {
  id: string;
  receipt_date: string;
  image_url: string | null;
  total_amount: number;
  status: string;
  extracted_line_items: LineItem[];
  supplier_id: string | null;
  created_at: string;
  raw_ocr_text: string | null;
};

type InventoryItem = {
  id: string;
  name: string;
};

const THRESHOLD_KEY = "receipt_match_confidence_threshold";
const DEFAULT_THRESHOLD = 0.6;

function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [reviewReceipt, setReviewReceipt] = useState<ReceiptRow | null>(null);
  const [editedLineItems, setEditedLineItems] = useState<LineItem[]>([]);
  const [applyingCosts, setApplyingCosts] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [compare, setCompare] = useState<{
    receiptId: string;
    previousText: string;
    previousItems: LineItem[];
    newText: string;
    newItems: LineItem[];
    newTotal: number;
  } | null>(null);
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [thresholdInput, setThresholdInput] = useState<string>(String(DEFAULT_THRESHOLD));
  const [savingThreshold, setSavingThreshold] = useState(false);
  // Per-row, per-field validation errors for the Review dialog
  const [lineItemErrors, setLineItemErrors] = useState<Record<number, LineItemErrors>>({});
  const [savingLineItems, setSavingLineItems] = useState(false);
  // Idle / loading / success / error state for each pending receipt's
  // "Process & save" button so users see explicit feedback per row.
  type ProcessState =
    | { status: "loading" }
    | { status: "success"; message: string }
    | { status: "error"; message: string };
  const [processState, setProcessState] = useState<Record<string, ProcessState>>({});

  const setRowState = (id: string, state: ProcessState | null) => {
    setProcessState((prev) => {
      const next = { ...prev };
      if (state === null) delete next[id];
      else next[id] = state;
      return next;
    });
  };

  const load = async () => {
    const [{ data: rData }, { data: iData }, { data: kv }] = await Promise.all([
      supabase.from("receipts").select("*").order("created_at", { ascending: false }),
      supabase.from("inventory_items").select("id, name").order("name"),
      (supabase as any).from("app_kv").select("value").eq("key", THRESHOLD_KEY).maybeSingle(),
    ]);
    if (rData) setReceipts(rData as unknown as ReceiptRow[]);
    if (iData) setInventoryItems(iData as InventoryItem[]);
    const parsed = parseFloat((kv as any)?.value ?? "");
    const next = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_THRESHOLD;
    setThreshold(next);
    setThresholdInput(String(next));
  };

  useEffect(() => { load(); }, []);

  const saveThreshold = async () => {
    const parsed = parseFloat(thresholdInput);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      toast.error("Threshold must be a number between 0 and 1 (e.g. 0.6)");
      return;
    }
    setSavingThreshold(true);
    const { error } = await (supabase as any)
      .from("app_kv")
      .upsert({ key: THRESHOLD_KEY, value: String(parsed) }, { onConflict: "key" });
    setSavingThreshold(false);
    if (error) { toast.error(error.message); return; }
    setThreshold(parsed);
    toast.success(`Confidence threshold set to ${(parsed * 100).toFixed(0)}%`);
  };

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("receipts").upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(fileName);

      await supabase.from("receipts").insert({
        image_url: urlData.publicUrl,
        status: "pending",
        receipt_date: new Date().toISOString().split("T")[0],
      });

      toast.success("Receipt uploaded successfully");
      load();
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload receipt");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleOCR = async (receipt: ReceiptRow, opts: { rerun?: boolean } = {}) => {
    if (!receipt.image_url) { toast.error("No image to process"); return; }
    setProcessing(receipt.id);
    try {
      const { processReceipt } = await import("@/lib/server-fns/process-receipt.functions");
      const data = await processReceipt({
        data: { imageUrl: receipt.image_url, receiptId: receipt.id, rerun: opts.rerun },
      });
      if (!data.success) throw new Error(data.error || "OCR failed");
      const total = data.line_items?.length || 0;
      const flagged = (data as any).flagged_count ?? data.line_items?.filter((it: any) => it.needs_review).length ?? 0;
      if (flagged > 0) {
        toast.warning(`Extracted ${total} line items · ${flagged} flagged for manual review (low confidence)`);
      } else {
        toast.success(`Extracted ${total} line items`);
      }
      // On a re-run, surface a side-by-side comparison of OCR text + line items
      if (opts.rerun) {
        setCompare({
          receiptId: receipt.id,
          previousText: data.previous?.raw_ocr_text ?? receipt.raw_ocr_text ?? "",
          previousItems: (data.previous?.line_items ?? receipt.extracted_line_items ?? []) as LineItem[],
          newText: data.raw_ocr_text ?? "",
          newItems: (data.line_items ?? []) as LineItem[],
          newTotal: Number(data.total_amount) || 0,
        });
      }
      load();
    } catch (err: any) {
      console.error("OCR error:", err);
      toast.error(err.message || "OCR processing failed");
    } finally {
      setProcessing(null);
    }
  };

  const openReview = (receipt: ReceiptRow) => {
    setReviewReceipt(receipt);
    setEditedLineItems(Array.isArray(receipt.extracted_line_items) ? [...receipt.extracted_line_items] : []);
    setLineItemErrors({});
  };

  const clearRowError = (idx: number, field: keyof LineItemErrors) => {
    setLineItemErrors((prev) => {
      if (!prev[idx]?.[field]) return prev;
      const nextRow = { ...prev[idx] };
      delete nextRow[field];
      const next = { ...prev };
      if (Object.keys(nextRow).length === 0) delete next[idx];
      else next[idx] = nextRow;
      return next;
    });
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: any) => {
    setEditedLineItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    if (field === "item_name" || field === "unit" || field === "quantity" || field === "unit_price") {
      clearRowError(idx, field);
    }
  };

  const matchLineItem = (idx: number, inventoryId: string) => {
    const inv = inventoryItems.find((i) => i.id === inventoryId);
    setEditedLineItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              matched_inventory_id: inventoryId,
              matched_inventory_name: inv?.name || null,
              needs_review: false,
              review_reason: null,
              match_source: item.match_source ?? "manual",
            }
          : item,
      )
    );
  };

  const addLineItem = () => {
    setEditedLineItems((prev) => [
      ...prev,
      { item_name: "", quantity: 1, unit: "each", unit_price: 0, total_price: 0, matched_inventory_id: null, matched_inventory_name: null },
    ]);
  };

  const removeLineItem = (idx: number) => {
    setEditedLineItems((prev) => prev.filter((_, i) => i !== idx));
    setLineItemErrors((prev) => {
      const next: Record<number, LineItemErrors> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < idx) next[i] = v;
        else if (i > idx) next[i - 1] = v;
      });
      return next;
    });
  };

  const addAllUnmatchedToInventory = async () => {
    const unmatched = editedLineItems
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !it.matched_inventory_id && (it.item_name || "").trim().length > 0);
    if (unmatched.length === 0) {
      toast("All line items are already matched");
      return;
    }
    setBulkAdding(true);
    const created: { idx: number; id: string; name: string }[] = [];
    let failed = 0;
    for (const { it, idx } of unmatched) {
      const price = Number(it.unit_price) || 0;
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({
          name: it.item_name.trim(),
          unit: it.unit || "each",
          current_stock: 0,
          par_level: 0,
          average_cost_per_unit: price,
          last_receipt_cost: price > 0 ? price : null,
          created_source: "receipt",
        })
        .select("id, name")
        .single();
      if (error || !data) { failed++; continue; }
      created.push({ idx, id: data.id, name: data.name });
    }
    if (created.length) {
      setEditedLineItems((prev) =>
        prev.map((item, i) => {
          const hit = created.find((c) => c.idx === i);
          return hit ? { ...item, matched_inventory_id: hit.id, matched_inventory_name: hit.name } : item;
        }),
      );
      // Refresh inventory dropdown so new items show up
      const { data: iData } = await supabase.from("inventory_items").select("id, name").order("name");
      if (iData) setInventoryItems(iData as InventoryItem[]);
    }
    setBulkAdding(false);
    if (failed === 0) toast.success(`Added ${created.length} item${created.length === 1 ? "" : "s"} to inventory and matched`);
    else toast.warning(`Added ${created.length}, ${failed} failed`);
  };

  const saveLineItems = async () => {
    if (!reviewReceipt) return;
    // Field-level validation before persisting
    const { errors, firstMessage } = validateLineItems(editedLineItems);
    setLineItemErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(firstMessage || "Fix highlighted fields before saving");
      return;
    }
    setSavingLineItems(true);
    const newTotal = editedLineItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
    const stillFlagged = editedLineItems.some((it) => it.needs_review);
    const update: Record<string, any> = {
      extracted_line_items: editedLineItems as any,
      total_amount: Math.round(newTotal * 100) / 100,
    };
    // If admin resolved all flagged matches, promote status out of needs_review.
    if (reviewReceipt.status === "needs_review" && !stillFlagged) {
      update.status = "reviewed";
    }
    const { error } = await supabase
      .from("receipts")
      .update(update as any)
      .eq("id", reviewReceipt.id);
    setSavingLineItems(false);
    if (error) { toast.error(error.message); return; }
    toast.success(stillFlagged ? "Saved · some items still flagged for review" : "Line items saved");
    load();
    setReviewReceipt(null);
  };

  const handleProcessAndSave = async (receipt: ReceiptRow) => {
    if (!receipt.image_url) {
      const msg = "No image to process";
      toast.error(msg);
      setRowState(receipt.id, { status: "error", message: msg });
      return;
    }
    setProcessing(receipt.id);
    setRowState(receipt.id, { status: "loading" });
    try {
      const { processReceipt } = await import("@/lib/server-fns/process-receipt.functions");
      const ocr = await processReceipt({
        data: { imageUrl: receipt.image_url, receiptId: receipt.id },
      });
      if (!ocr.success) throw new Error((ocr as any).error || "OCR failed");
      const total = ocr.line_items?.length || 0;
      const flagged = (ocr as any).flagged_count ?? ocr.line_items?.filter((it: any) => it.needs_review).length ?? 0;
      if (flagged > 0) {
        const msg = `Saved ${total} items · ${flagged} need review`;
        toast.warning(`Saved ${total} line items · ${flagged} flagged — review before applying costs`);
        setRowState(receipt.id, { status: "success", message: msg });
        load();
        return;
      }
      // Auto-apply costs when nothing needs review
      const { updateInventoryCosts } = await import("@/lib/server-fns/update-inventory-costs.functions");
      const applied = await updateInventoryCosts({ data: { receiptId: receipt.id } });
      const updates = applied.updates || [];
      const msg = `Saved ${total} items · updated ${updates.length} costs`;
      toast.success(`Saved ${total} items and updated costs for ${updates.length} inventory items`);
      setRowState(receipt.id, { status: "success", message: msg });
      load();
    } catch (err: any) {
      console.error("Process & save error:", err);
      const msg = err?.message || "Failed to process receipt";
      toast.error(msg);
      setRowState(receipt.id, { status: "error", message: msg });
    } finally {
      setProcessing(null);
    }
  };

  const handleApplyCosts = async (receiptId: string) => {
    setApplyingCosts(true);
    try {
      const { updateInventoryCosts } = await import("@/lib/server-fns/update-inventory-costs.functions");
      const data = await updateInventoryCosts({ data: { receiptId } });
      const updates = data.updates || [];
      toast.success(`Updated costs for ${updates.length} inventory items`);
      load();
    } catch (err: any) {
      console.error("Apply costs error:", err);
      toast.error(err.message || "Failed to apply costs");
    } finally {
      setApplyingCosts(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "reviewed": return <FileText className="w-4 h-4 text-gold" />;
      case "needs_review": return <ShieldAlert className="w-4 h-4 text-warning" />;
      case "failed": return <AlertTriangle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const statusLabel = (status: string) =>
    status === "needs_review" ? "needs review" : status;

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/receipts" />

      {/* Confidence threshold settings */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 mr-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Auto-review confidence threshold</p>
              <p className="text-xs text-muted-foreground">
                Receipt matches scoring below this value are auto-flagged for manual review instead of being applied.
              </p>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="threshold" className="text-xs">Threshold (0–1)</Label>
              <Input
                id="threshold"
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="h-9 w-28"
              />
            </div>
            <Button onClick={saveThreshold} disabled={savingThreshold} className="gap-1.5">
              {savingThreshold ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
            <span className="text-xs text-muted-foreground pb-2">
              Current: <span className="font-medium">{(threshold * 100).toFixed(0)}%</span>
            </span>
          </div>
        </CardContent>
      </Card>
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
      >
        <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium text-foreground mb-1">{uploading ? "Uploading..." : "Drag & drop receipt image or PDF"}</p>
        <p className="text-sm text-muted-foreground mb-4">Supports JPG, PNG, PDF</p>
        <label className="cursor-pointer">
          <span className="inline-flex items-center justify-center rounded-lg bg-gradient-warm px-6 py-2.5 text-sm font-semibold text-primary-foreground">Browse Files</span>
          <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileInput} disabled={uploading} />
        </label>
      </div>

      {/* Receipt list */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <h3 className="font-display text-xl font-semibold">Receipt History</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="receipt-search" className="text-xs">Search</Label>
              <Input
                id="receipt-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Item, OCR text, or date (YYYY-MM-DD)"
                className="h-9 w-[260px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="receipt-status" className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="receipt-status" className="h-9 w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({receipts.length})</SelectItem>
                  <SelectItem value="pending">
                    Pending ({receipts.filter((r) => r.status === "pending").length})
                  </SelectItem>
                  <SelectItem value="needs_review">
                    Needs review ({receipts.filter((r) => r.status === "needs_review").length})
                  </SelectItem>
                  <SelectItem value="reviewed">
                    Reviewed ({receipts.filter((r) => r.status === "reviewed").length})
                  </SelectItem>
                  <SelectItem value="processed">
                    Processed ({receipts.filter((r) => r.status === "processed").length})
                  </SelectItem>
                  <SelectItem value="failed">
                    Failed ({receipts.filter((r) => r.status === "failed").length})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(search || statusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setStatusFilter("all"); }}
                className="h-9"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        {(() => {
          const q = search.trim().toLowerCase();
          const visibleReceipts = receipts.filter((r) => {
            if (statusFilter !== "all" && r.status !== statusFilter) return false;
            if (!q) return true;
            if (r.receipt_date && r.receipt_date.toLowerCase().includes(q)) return true;
            if (r.raw_ocr_text && r.raw_ocr_text.toLowerCase().includes(q)) return true;
            if (Array.isArray(r.extracted_line_items)) {
              if (r.extracted_line_items.some((it) =>
                (it?.item_name || "").toLowerCase().includes(q) ||
                (it?.matched_inventory_name || "").toLowerCase().includes(q)
              )) return true;
            }
            return false;
          });
          return (
        receipts.length === 0 ? (
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-12 text-center">
              <Receipt className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No receipts uploaded yet.</p>
            </CardContent>
          </Card>
        ) : visibleReceipts.length === 0 ? (
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No receipts match the current filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleReceipts.map((r) => (
              <Card key={r.id} className="shadow-warm border-border/50 hover:shadow-gold transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  {r.image_url ? (
                    <button
                      type="button"
                      onClick={() => openReview(r)}
                      className="shrink-0 rounded-lg border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                      aria-label="View receipt photo"
                    >
                      <img src={r.image_url} alt="Receipt" className="w-24 h-24 object-cover" />
                    </button>
                  ) : (
                    <div className="w-24 h-24 shrink-0 rounded-lg border border-border bg-muted/40 flex items-center justify-center">
                      <Receipt className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusIcon(r.status)}
                      <span className="text-sm font-medium capitalize">{statusLabel(r.status)}</span>
                      {Array.isArray(r.extracted_line_items) && r.extracted_line_items.some((it) => it?.needs_review) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          <ShieldAlert className="w-3 h-3" />
                          {r.extracted_line_items.filter((it) => it?.needs_review).length} flagged
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(r.receipt_date).toLocaleDateString()} · {Array.isArray(r.extracted_line_items) ? r.extracted_line_items.length : 0} items
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {r.status === "pending" && (() => {
                      const rs = processState[r.id];
                      const isLoading = rs?.status === "loading";
                      const isError = rs?.status === "error";
                      const isSuccess = rs?.status === "success";
                      return (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleOCR(r)} disabled={processing === r.id || isLoading} className="gap-1.5">
                            {processing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scan className="w-3.5 h-3.5" />}
                            {processing === r.id ? "Processing..." : "Run OCR"}
                          </Button>
                          <div className="flex flex-col items-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleProcessAndSave(r)}
                              disabled={processing === r.id || isLoading || applyingCosts}
                              variant={isError ? "destructive" : "default"}
                              className={
                                isError
                                  ? "gap-1.5"
                                  : isSuccess
                                    ? "gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                                    : "gap-1.5 bg-gradient-warm text-primary-foreground"
                              }
                              aria-label={
                                isLoading
                                  ? "Processing receipt"
                                  : isError
                                    ? `Retry processing: ${rs.message}`
                                    : isSuccess
                                      ? rs.message
                                      : "Process and save receipt"
                              }
                            >
                              {isLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isSuccess ? (
                                <CheckCircle className="w-3.5 h-3.5" />
                              ) : isError ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowRight className="w-3.5 h-3.5" />
                              )}
                              {isLoading
                                ? "Processing..."
                                : isError
                                  ? "Retry"
                                  : isSuccess
                                    ? "Done"
                                    : "Process & save"}
                            </Button>
                            {(isSuccess || isError) && (
                              <p
                                className={`text-[10px] max-w-[200px] text-right ${isError ? "text-destructive" : "text-muted-foreground"}`}
                                role={isError ? "alert" : "status"}
                              >
                                {rs.message}
                              </p>
                            )}
                          </div>
                        </>
                      );
                    })()}
                    {(r.status === "reviewed" || r.status === "needs_review") && (
                      <>
                        <Button size="sm" variant={r.status === "needs_review" ? "default" : "outline"} onClick={() => openReview(r)} className="gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Review
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleOCR(r, { rerun: true })} disabled={processing === r.id} className="gap-1.5">
                          {processing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Re-run OCR
                        </Button>
                        <Button size="sm" onClick={() => handleApplyCosts(r.id)} disabled={applyingCosts} className="bg-gradient-warm text-primary-foreground gap-1.5">
                          {applyingCosts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                          Apply Costs
                        </Button>
                      </>
                    )}
                    {r.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => handleOCR(r, { rerun: true })} disabled={processing === r.id} className="gap-1.5">
                        {processing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {processing === r.id ? "Processing..." : "Re-run OCR"}
                      </Button>
                    )}
                    {r.status === "processed" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openReview(r)} className="gap-1.5">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleOCR(r, { rerun: true })} disabled={processing === r.id} className="gap-1.5">
                          {processing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Re-run OCR
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="font-display text-lg font-bold whitespace-nowrap">${Number(r.total_amount).toFixed(2)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={!!reviewReceipt} onOpenChange={(open) => !open && setReviewReceipt(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {reviewReceipt?.status === "processed" ? "Edit Receipt" : "Review Extracted Line Items"}
            </DialogTitle>
          </DialogHeader>
          {reviewReceipt && (
            <div className="grid md:grid-cols-2 gap-6">
              {reviewReceipt.image_url && (
                <div className="space-y-2">
                  <a href={reviewReceipt.image_url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={reviewReceipt.image_url}
                      alt="Receipt"
                      className="w-full max-h-[70vh] object-contain rounded-lg border border-border bg-muted/20"
                    />
                  </a>
                  <p className="text-xs text-muted-foreground text-center">Tap image to open full size</p>
                </div>
              )}
              <div className="space-y-3">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Item</th>
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Qty</th>
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Unit</th>
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Unit $</th>
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Total</th>
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Inventory Match</th>
                      <th className="py-2 px-2 font-semibold text-muted-foreground">Confidence</th>
                      <th className="py-2 px-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editedLineItems.map((item, idx) => {
                      const rowErr = lineItemErrors[idx] || {};
                      const errClass = "border-destructive focus-visible:ring-destructive";
                      return (
                      <tr key={idx} className={`border-b border-border/50 ${item.needs_review ? "bg-warning/5" : ""} ${rowErr && Object.keys(rowErr).length > 0 ? "bg-destructive/5" : ""}`}>
                        <td className="py-2 px-2 align-top">
                          <Input
                            value={item.item_name}
                            onChange={(e) => updateLineItem(idx, "item_name", e.target.value)}
                            className={`h-8 text-xs min-w-[140px] ${rowErr.item_name ? errClass : ""}`}
                            aria-invalid={!!rowErr.item_name}
                          />
                          {rowErr.item_name && <p className="text-[10px] text-destructive mt-0.5">{rowErr.item_name}</p>}
                        </td>
                        <td className="py-2 px-2 align-top">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                            className={`h-8 text-xs w-16 ${rowErr.quantity ? errClass : ""}`}
                            aria-invalid={!!rowErr.quantity}
                          />
                          {rowErr.quantity && <p className="text-[10px] text-destructive mt-0.5">{rowErr.quantity}</p>}
                        </td>
                        <td className="py-2 px-2 align-top">
                          <Input
                            value={item.unit}
                            onChange={(e) => updateLineItem(idx, "unit", e.target.value)}
                            className={`h-8 text-xs w-16 ${rowErr.unit ? errClass : ""}`}
                            aria-invalid={!!rowErr.unit}
                          />
                          {rowErr.unit && <p className="text-[10px] text-destructive mt-0.5">{rowErr.unit}</p>}
                        </td>
                        <td className="py-2 px-2 align-top">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                            className={`h-8 text-xs w-20 ${rowErr.unit_price ? errClass : ""}`}
                            aria-invalid={!!rowErr.unit_price}
                          />
                          {rowErr.unit_price && <p className="text-[10px] text-destructive mt-0.5">{rowErr.unit_price}</p>}
                        </td>
                        <td className="py-2 px-2 font-medium whitespace-nowrap align-top">${(item.quantity * item.unit_price).toFixed(2)}</td>
                        <td className="py-2 px-2">
                          <Select value={item.matched_inventory_id || ""} onValueChange={(v) => matchLineItem(idx, v)}>
                            <SelectTrigger className={`h-8 text-xs min-w-[140px] ${item.needs_review ? "border-warning" : ""}`}><SelectValue placeholder={item.needs_review && item.matched_inventory_name ? `Suggested: ${item.matched_inventory_name}` : "Match..."} /></SelectTrigger>
                            <SelectContent>
                              {inventoryItems.map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          {typeof item.match_score === "number" ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                item.needs_review
                                  ? "bg-warning/15 text-warning"
                                  : "bg-success/15 text-success"
                              }`}
                              title={item.review_reason || `Source: ${item.match_source ?? "—"}`}
                            >
                              {item.needs_review && <ShieldAlert className="w-3 h-3" />}
                              {(item.match_score * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">—</span>
                          )}
                        </td>
                        <td className="py-2 px-1">
                          <Button size="icon" variant="ghost" onClick={() => removeLineItem(idx)} className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={addLineItem} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add line item
                  </Button>
                  {editedLineItems.some((it) => !it.matched_inventory_id && (it.item_name || "").trim().length > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addAllUnmatchedToInventory}
                      disabled={bulkAdding}
                      className="gap-1.5"
                    >
                      {bulkAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackagePlus className="w-3.5 h-3.5" />}
                      Add all unmatched to inventory
                    </Button>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 pt-2 border-t">
                  {Object.keys(lineItemErrors).length > 0 && (
                    <p className="text-xs text-destructive flex items-center gap-1.5" role="alert">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {Object.keys(lineItemErrors).length} row{Object.keys(lineItemErrors).length === 1 ? "" : "s"} need fixing before save
                    </p>
                  )}
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setReviewReceipt(null)} disabled={savingLineItems}>Cancel</Button>
                    <Button
                      onClick={saveLineItems}
                      disabled={savingLineItems || Object.keys(lineItemErrors).length > 0}
                      className="bg-gradient-warm text-primary-foreground gap-1.5"
                    >
                      {savingLineItems ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {savingLineItems ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* OCR Re-run Comparison Dialog */}
      <Dialog open={!!compare} onOpenChange={(open) => !open && setCompare(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <RefreshCw className="w-5 h-5" /> OCR Re-run Comparison
            </DialogTitle>
          </DialogHeader>
          {compare && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous OCR text</p>
                  <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                    {compare.previousText || <span className="text-muted-foreground italic">No previous OCR text on record.</span>}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New OCR text</p>
                  <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                    {compare.newText || <span className="text-muted-foreground italic">No raw text returned.</span>}
                  </pre>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Previous line items ({compare.previousItems.length})
                  </p>
                  <LineItemsTable items={compare.previousItems} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    New line items ({compare.newItems.length}) · total ${compare.newTotal.toFixed(2)}
                  </p>
                  <LineItemsTable items={compare.newItems} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button variant="outline" onClick={() => setCompare(null)}>Close</Button>
                <Button
                  onClick={() => {
                    const updated = receipts.find((r) => r.id === compare.receiptId);
                    setCompare(null);
                    if (updated) openReview(updated);
                  }}
                  className="bg-gradient-warm text-primary-foreground"
                >
                  Review new line items
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LineItemsTable({ items }: { items: LineItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic border border-dashed border-border rounded-md p-4 text-center">
        No line items.
      </div>
    );
  }
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left p-2 font-medium">Item</th>
            <th className="text-right p-2 font-medium">Qty</th>
            <th className="text-left p-2 font-medium">Unit</th>
            <th className="text-right p-2 font-medium">Price</th>
            <th className="text-right p-2 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-t border-border">
              <td className="p-2">{it.item_name || <span className="text-muted-foreground italic">—</span>}</td>
              <td className="p-2 text-right">{Number(it.quantity || 0)}</td>
              <td className="p-2">{it.unit || ""}</td>
              <td className="p-2 text-right">${Number(it.unit_price || 0).toFixed(2)}</td>
              <td className="p-2 text-right">${Number(it.total_price || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
