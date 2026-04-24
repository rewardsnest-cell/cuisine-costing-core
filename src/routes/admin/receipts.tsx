import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt, Upload, CheckCircle, Clock, FileText, Scan, ArrowRight, Loader2, Plus, Trash2, Pencil, PackagePlus, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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
  const [compare, setCompare] = useState<{
    receiptId: string;
    previousText: string;
    previousItems: LineItem[];
    newText: string;
    newItems: LineItem[];
    newTotal: number;
  } | null>(null);

  const load = async () => {
    const [{ data: rData }, { data: iData }] = await Promise.all([
      supabase.from("receipts").select("*").order("created_at", { ascending: false }),
      supabase.from("inventory_items").select("id, name").order("name"),
    ]);
    if (rData) setReceipts(rData as unknown as ReceiptRow[]);
    if (iData) setInventoryItems(iData as InventoryItem[]);
  };

  useEffect(() => { load(); }, []);

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
      toast.success(`Extracted ${data.line_items?.length || 0} line items`);
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
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: any) => {
    setEditedLineItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const matchLineItem = (idx: number, inventoryId: string) => {
    const inv = inventoryItems.find((i) => i.id === inventoryId);
    setEditedLineItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, matched_inventory_id: inventoryId, matched_inventory_name: inv?.name || null } : item
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
    const newTotal = editedLineItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
    const { error } = await supabase
      .from("receipts")
      .update({ extracted_line_items: editedLineItems as any, total_amount: Math.round(newTotal * 100) / 100 })
      .eq("id", reviewReceipt.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Line items saved");
    load();
    setReviewReceipt(null);
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
      case "failed": return <AlertTriangle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/receipts" />
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
        <h3 className="font-display text-xl font-semibold mb-4">Receipt History</h3>
        {receipts.length === 0 ? (
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-12 text-center">
              <Receipt className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No receipts uploaded yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {receipts.map((r) => (
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
                    <div className="flex items-center gap-2">
                      {statusIcon(r.status)}
                      <span className="text-sm font-medium capitalize">{r.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(r.receipt_date).toLocaleDateString()} · {Array.isArray(r.extracted_line_items) ? r.extracted_line_items.length : 0} items
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => handleOCR(r)} disabled={processing === r.id} className="gap-1.5">
                        {processing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scan className="w-3.5 h-3.5" />}
                        {processing === r.id ? "Processing..." : "Run OCR"}
                      </Button>
                    )}
                    {r.status === "reviewed" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openReview(r)} className="gap-1.5">
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
                      <th className="py-2 px-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editedLineItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="py-2 px-2">
                          <Input value={item.item_name} onChange={(e) => updateLineItem(idx, "item_name", e.target.value)} className="h-8 text-xs min-w-[140px]" />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" value={item.quantity} onChange={(e) => updateLineItem(idx, "quantity", parseFloat(e.target.value) || 0)} className="h-8 text-xs w-16" />
                        </td>
                        <td className="py-2 px-2">
                          <Input value={item.unit} onChange={(e) => updateLineItem(idx, "unit", e.target.value)} className="h-8 text-xs w-16" />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateLineItem(idx, "unit_price", parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20" />
                        </td>
                        <td className="py-2 px-2 font-medium whitespace-nowrap">${(item.quantity * item.unit_price).toFixed(2)}</td>
                        <td className="py-2 px-2">
                          <Select value={item.matched_inventory_id || ""} onValueChange={(v) => matchLineItem(idx, v)}>
                            <SelectTrigger className="h-8 text-xs min-w-[140px]"><SelectValue placeholder="Match..." /></SelectTrigger>
                            <SelectContent>
                              {inventoryItems.map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-1">
                          <Button size="icon" variant="ghost" onClick={() => removeLineItem(idx)} className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
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
                <div className="flex justify-end gap-3 pt-2 border-t">
                  <Button variant="outline" onClick={() => setReviewReceipt(null)}>Cancel</Button>
                  <Button onClick={saveLineItems} className="bg-gradient-warm text-primary-foreground">Save Changes</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
