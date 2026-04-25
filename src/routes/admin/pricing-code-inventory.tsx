import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileCode2, FileJson, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import {
  PRICING_INVENTORY,
  PRICING_INVENTORY_GENERATED_AT,
  SQL_PRICING_APPENDIX,
  SQL_PRICING_REFERENCES,
  buildSqlAppendixText,
  summarizeInventory,
  type InventoryEntry,
  type InventoryRecommendation,
} from "@/lib/admin/pricing-code-inventory";
import { saveAndLogDownload } from "@/lib/downloads/save-download";

export const Route = createFileRoute("/admin/pricing-code-inventory")({
  head: () => ({
    meta: [
      { title: "Pricing Code Inventory — Admin" },
      { name: "description", content: "Read-only catalogue of pricing, costing, and unit logic across the codebase." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PricingCodeInventoryPage,
});

const RECOMMENDATION_BADGE: Record<InventoryRecommendation, string> = {
  KEEP: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  CENTRALIZE: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  EXPOSE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  LEGACY: "bg-muted text-muted-foreground",
};

function matches(entry: InventoryEntry, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.path.toLowerCase().includes(needle) ||
    entry.layer.toLowerCase().includes(needle) ||
    entry.purpose.toLowerCase().includes(needle) ||
    entry.notes.toLowerCase().includes(needle) ||
    entry.recommendation.toLowerCase().includes(needle)
  );
}

function PricingCodeInventoryPage() {
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState<null | "pdf" | "json">(null);

  const filtered = useMemo(
    () => PRICING_INVENTORY.filter((e) => matches(e, query)),
    [query],
  );
  const summary = useMemo(() => summarizeInventory(), []);

  async function handleJsonExport() {
    try {
      setDownloading("json");
      const payload = {
        generated_at: PRICING_INVENTORY_GENERATED_AT,
        summary,
        entries: PRICING_INVENTORY,
        sql_references: SQL_PRICING_REFERENCES,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const result = await saveAndLogDownload({
        blob,
        filename: `pricing-code-inventory-${PRICING_INVENTORY_GENERATED_AT}.json`,
        kind: "admin_export",
        sourceLabel: "Pricing Code Inventory (JSON)",
      });
      toast.success(result.persisted ? "JSON saved to Downloads Hub" : "JSON downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export JSON");
    } finally {
      setDownloading(null);
    }
  }

  async function handlePdfExport() {
    try {
      setDownloading("pdf");
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      doc.setFontSize(16);
      doc.text("Pricing Code Inventory", 40, 48);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Generated ${PRICING_INVENTORY_GENERATED_AT} · ${summary.total} files`, 40, 64);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 84,
        head: [["Path", "Layer", "Purpose", "Notes", "Rec."]],
        body: PRICING_INVENTORY.map((e) => [
          e.path,
          e.layer,
          e.purpose,
          e.notes,
          e.recommendation,
        ]),
        styles: { fontSize: 8, cellPadding: 4, valign: "top" },
        headStyles: { fillColor: [30, 30, 30] },
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 90 },
          2: { cellWidth: 140 },
          3: { cellWidth: 130 },
          4: { cellWidth: 50 },
        },
      });

      const after = (doc as any).lastAutoTable?.finalY ?? 84;
      doc.setFontSize(12);
      doc.text("SQL pricing references", 40, after + 28);
      autoTable(doc, {
        startY: after + 36,
        head: [["Object", "Purpose"]],
        body: SQL_PRICING_REFERENCES.map((r) => [r.name, r.purpose]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30] },
      });

      const blob = doc.output("blob");
      const result = await saveAndLogDownload({
        blob,
        filename: `pricing-code-inventory-${PRICING_INVENTORY_GENERATED_AT}.pdf`,
        kind: "admin_export",
        sourceLabel: "Pricing Code Inventory (PDF)",
      });
      toast.success(result.persisted ? "PDF saved to Downloads Hub" : "PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export PDF");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Pricing Code Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Read-only catalogue of pricing, costing, unit, and quote logic across the repo.
            Generated {PRICING_INVENTORY_GENERATED_AT}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleJsonExport} disabled={downloading !== null}>
            <FileJson className="w-4 h-4 mr-2" />
            {downloading === "json" ? "Exporting…" : "Export JSON"}
          </Button>
          <Button onClick={handlePdfExport} disabled={downloading !== null}>
            <Download className="w-4 h-4 mr-2" />
            {downloading === "pdf" ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Total files" value={summary.total} />
        <SummaryCard label="KEEP" value={summary.byRecommendation.KEEP} />
        <SummaryCard label="CENTRALIZE" value={summary.byRecommendation.CENTRALIZE} />
        <SummaryCard label="EXPOSE" value={summary.byRecommendation.EXPOSE} />
        <SummaryCard label="LEGACY" value={summary.byRecommendation.LEGACY} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" /> Files & summaries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search path, layer, purpose, notes…"
              className="pl-9"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Path</th>
                  <th className="py-2 pr-3 font-medium">Layer</th>
                  <th className="py-2 pr-3 font-medium">Purpose</th>
                  <th className="py-2 pr-3 font-medium">Notes</th>
                  <th className="py-2 pr-3 font-medium">Rec.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.path} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-xs break-all">{e.path}</td>
                    <td className="py-2 pr-3">{e.layer}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{e.purpose}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{e.notes || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge className={RECOMMENDATION_BADGE[e.recommendation]} variant="secondary">
                        {e.recommendation}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No entries match “{query}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SQL pricing references</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {SQL_PRICING_REFERENCES.map((r) => (
              <li key={r.name} className="flex flex-col md:flex-row md:gap-3">
                <span className="font-mono text-xs">{r.name}</span>
                <span className="text-muted-foreground">{r.purpose}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
