import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Receipt, Upload, CheckCircle, Clock, FileText } from "lucide-react";

export const Route = createFileRoute("/admin/receipts")({
  component: ReceiptsPage,
});

type ReceiptRow = {
  id: string;
  receipt_date: string;
  image_url: string | null;
  total_amount: number;
  status: string;
  extracted_line_items: any[];
  supplier_id: string | null;
  created_at: string;
};

function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("receipts").select("*").order("created_at", { ascending: false });
    if (data) setReceipts(data as ReceiptRow[]);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from("receipts").upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(fileName);

      await supabase.from("receipts").insert({
        image_url: urlData.publicUrl,
        status: "pending",
        receipt_date: new Date().toISOString().split("T")[0],
      });

      load();
    } catch (err) {
      console.error("Upload error:", err);
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

  const statusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "reviewed": return <FileText className="w-4 h-4 text-gold" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium text-foreground mb-1">
          {uploading ? "Uploading..." : "Drag & drop receipt image or PDF"}
        </p>
        <p className="text-sm text-muted-foreground mb-4">Supports JPG, PNG, PDF</p>
        <label className="cursor-pointer">
          <span className="inline-flex items-center justify-center rounded-lg bg-gradient-warm px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            Browse Files
          </span>
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
              <p className="text-muted-foreground">No receipts uploaded yet. Upload your first receipt to start tracking costs.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {receipts.map((r) => (
              <Card key={r.id} className="shadow-warm border-border/50 hover:shadow-gold transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  {r.image_url && (
                    <img src={r.image_url} alt="Receipt" className="w-16 h-16 object-cover rounded-lg border border-border" />
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
                  <div className="text-right">
                    <p className="font-display text-lg font-bold">${Number(r.total_amount).toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
