import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  FileDown,
  Database,
  Loader2,
  Check,
  Download,
} from "lucide-react";
import { PROJECT_AUDIT_MD, rowsToCsv, downloadFile } from "@/lib/admin/project-audit";
import jsPDF from "jspdf";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/exports")({
  head: () => ({
    meta: [
      { title: "Exports & Reports — Admin" },
      {
        name: "description",
        content:
          "Download a project audit (Markdown or PDF) and export your operational data as CSV.",
      },
    ],
  }),
  component: ExportsPage,
});

type CsvSpec = {
  key: string;
  label: string;
  description: string;
  table: string;
  select: string;
  filename: string;
};

const CSV_EXPORTS: CsvSpec[] = [
  {
    key: "quotes",
    label: "Quotes",
    description: "All quotes with totals, client info, and status.",
    table: "quotes",
    select: "*",
    filename: "quotes.csv",
  },
  {
    key: "quote_items",
    label: "Quote line items",
    description: "Every line item across all quotes.",
    table: "quote_items",
    select: "*",
    filename: "quote_items.csv",
  },
  {
    key: "inventory_items",
    label: "Inventory",
    description: "Current stock, par levels, average cost.",
    table: "inventory_items",
    select: "*",
    filename: "inventory.csv",
  },
  {
    key: "price_history",
    label: "Price history (trend data)",
    description: "Every observed unit price from receipts, POs, and sale flyers.",
    table: "price_history",
    select: "*",
    filename: "price_history.csv",
  },
  {
    key: "recipes",
    label: "Recipes",
    description: "Recipe catalog with cost per serving.",
    table: "recipes",
    select: "*",
    filename: "recipes.csv",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Vendor directory with contacts.",
    table: "suppliers",
    select: "*",
    filename: "suppliers.csv",
  },
  {
    key: "purchase_orders",
    label: "Purchase orders",
    description: "All POs with totals and status.",
    table: "purchase_orders",
    select: "*",
    filename: "purchase_orders.csv",
  },
  {
    key: "receipts",
    label: "Receipts",
    description: "All scanned receipts with extracted totals.",
    table: "receipts",
    select: "*",
    filename: "receipts.csv",
  },
  {
    key: "event_time_entries",
    label: "Time entries",
    description: "Employee clock-in/out records.",
    table: "event_time_entries",
    select: "*",
    filename: "time_entries.csv",
  },
];

function ExportsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const handleDownloadMarkdown = async () => {
    setBusy("md");
    try {
      await downloadFile(
        PROJECT_AUDIT_MD,
        `PROJECT_AUDIT_${today}.md`,
        "text/markdown;charset=utf-8",
      );
      flashDone("md");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadPdf = () => {
    setBusy("pdf");
    try {
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const margin = 48;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Project Audit — VP Finest", margin, margin);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Generated ${today}`, margin, margin + 18);
      doc.setTextColor(0);

      let y = margin + 44;
      const lineHeight = 13;

      // Render markdown as plain wrapped text with basic heading styling.
      const lines = PROJECT_AUDIT_MD.split("\n");
      for (const raw of lines) {
        const line = raw.trimEnd();
        let fontSize = 10;
        let bold = false;

        if (line.startsWith("# ")) {
          fontSize = 16;
          bold = true;
        } else if (line.startsWith("## ")) {
          fontSize = 13;
          bold = true;
          y += 6;
        } else if (line.startsWith("### ")) {
          fontSize = 11;
          bold = true;
        }

        const text = line
          .replace(/^#+\s*/, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1");

        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(fontSize);

        if (text === "") {
          y += lineHeight / 2;
          continue;
        }

        const wrapped = doc.splitTextToSize(text, usableWidth);
        for (const w of wrapped) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(w, margin, y);
          y += fontSize < 11 ? lineHeight : fontSize + 4;
        }
      }

      doc.save(`PROJECT_AUDIT_${today}.pdf`);
      flashDone("pdf");
    } catch (e: any) {
      setError(e.message || "PDF generation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = async (spec: CsvSpec) => {
    setBusy(spec.key);
    setError(null);
    try {
      // Page through results to bypass the 1000-row default limit.
      const all: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error: e } = await (supabase as any)
          .from(spec.table)
          .select(spec.select)
          .range(from, from + PAGE - 1);
        if (e) throw e;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      if (all.length === 0) {
        downloadFile("(no rows)\n", spec.filename, "text/csv;charset=utf-8");
      } else {
        const csv = rowsToCsv(all);
        downloadFile(csv, spec.filename, "text/csv;charset=utf-8");
      }
      flashDone(spec.key);
    } catch (e: any) {
      setError(`${spec.label}: ${e.message || "Export failed"}`);
    } finally {
      setBusy(null);
    }
  };

  const handleExportAllCsv = async () => {
    setBusy("all");
    setError(null);
    try {
      for (const spec of CSV_EXPORTS) {
        const { data, error: e } = await (supabase as any)
          .from(spec.table)
          .select(spec.select)
          .range(0, 9999);
        if (e) throw e;
        const csv = rowsToCsv(data ?? []);
        downloadFile(csv, spec.filename, "text/csv;charset=utf-8");
        // small delay so browsers don't block bulk downloads
        await new Promise((r) => setTimeout(r, 250));
      }
      flashDone("all");
    } catch (e: any) {
      setError(e.message || "Bulk export failed");
    } finally {
      setBusy(null);
    }
  };

  function flashDone(key: string) {
    setDone((d) => ({ ...d, [key]: true }));
    setTimeout(() => setDone((d) => ({ ...d, [key]: false })), 2500);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHelpCard route="/admin/exports" />
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Exports & Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download a snapshot of the project architecture or export your raw
          operational data as CSV.
        </p>
      </header>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {error}
        </div>
      )}

      {/* Project audit */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Project audit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A structured inventory of the project — schema, routes, server
            actions, AI workflows, KPIs, auth model, and environment. Useful as
            context for Copilot, Cursor, or onboarding documents.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleDownloadMarkdown}
              disabled={!!busy}
              variant="outline"
              className="gap-2"
            >
              {busy === "md" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : done.md ? (
                <Check className="w-4 h-4" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Download Markdown
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={!!busy}
              className="bg-gradient-warm text-primary-foreground gap-2"
            >
              {busy === "pdf" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : done.pdf ? (
                <Check className="w-4 h-4" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CSV exports */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" /> Data exports (CSV)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Each export includes every row you have access to.
            </p>
            <Button
              onClick={handleExportAllCsv}
              disabled={!!busy}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {busy === "all" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : done.all ? (
                <Check className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download all
            </Button>
          </div>

          <div className="space-y-2">
            {CSV_EXPORTS.map((spec) => (
              <div
                key={spec.key}
                className="flex items-center justify-between gap-3 border border-border/60 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{spec.label}</p>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {spec.table}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {spec.description}
                  </p>
                </div>
                <Button
                  onClick={() => handleExportCsv(spec)}
                  disabled={!!busy}
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 shrink-0"
                >
                  {busy === spec.key ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : done[spec.key] ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  CSV
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
