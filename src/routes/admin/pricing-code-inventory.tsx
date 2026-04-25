import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Download, FileJson, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import {
  PRICING_INVENTORY,
  PRICING_INVENTORY_FINDINGS,
  PRICING_INVENTORY_GENERATED_AT,
  PRICING_INVENTORY_SQL_REFERENCE,
  type PricingFileEntry,
  type Recommendation,
} from "@/lib/admin/pricing-code-inventory";
import { saveAndLogDownload } from "@/lib/downloads/save-download";

export const Route = createFileRoute("/admin/pricing-code-inventory")({
  head: () => ({
    meta: [
      { title: "Pricing Code Inventory — Admin" },
      { name: "description", content: "Read-only catalogue of every pricing-related file in the codebase, exportable as PDF or JSON." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PricingCodeInventoryPage,
});

const RECO_COLORS: Record<Recommendation, string> = {
  KEEP: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  CENTRALIZE: "bg-blue-500/10 text-blue-700 border-blue-300",
  EXPOSE: "bg-violet-500/10 text-violet-700 border-violet-300",
  LEGACY: "bg-amber-500/10 text-amber-700 border-amber-300",
};

function entryMatches(entry: PricingFileEntry, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    entry.path.toLowerCase().includes(s) ||
    entry.does.toLowerCase().includes(s) ||
    entry.layers.some((l) => l.toLowerCase().includes(s)) ||
    (entry.notes ?? "").toLowerCase().includes(s) ||
    entry.recommendation.toLowerCase().includes(s)
  );
}

function buildJson() {
  return {
    generated_at: PRICING_INVENTORY_GENERATED_AT,
    project: "VPS Finest",
    title: "Pricing-Related Code Inventory (Read-Only)",
    sections: PRICING_INVENTORY,
    sql_reference: PRICING_INVENTORY_SQL_REFERENCE,
    cross_cutting_findings: PRICING_INVENTORY_FINDINGS,
  };
}

async function downloadJson() {
  const json = JSON.stringify(buildJson(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const filename = `pricing-code-inventory-${PRICING_INVENTORY_GENERATED_AT}.json`;
  await saveAndLogDownload({
    blob,
    filename,
    kind: "admin_export",
    sourceLabel: "Pricing Code Inventory (JSON)",
  });
}

async function downloadPdf() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text: string, opts: { size: number; bold?: boolean; color?: [number, number, number]; gap?: number }) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size);
    doc.setTextColor(...(opts.color ?? [20, 20, 20]));
    const lines = doc.splitTextToSize(text, contentW);
    const lineH = opts.size * 1.25;
    for (const line of lines) {
      ensureSpace(lineH);
      doc.text(line, margin, y);
      y += lineH;
    }
    y += opts.gap ?? 4;
  };

  // Title
  writeWrapped("Pricing-Related Code Inventory", { size: 20, bold: true, gap: 6 });
  writeWrapped("Project: VPS Finest · Read-only audit", { size: 10, color: [110, 110, 110], gap: 2 });
  writeWrapped(`Generated: ${PRICING_INVENTORY_GENERATED_AT}`, { size: 10, color: [110, 110, 110], gap: 14 });

  for (const section of PRICING_INVENTORY) {
    ensureSpace(40);
    writeWrapped(section.title, { size: 14, bold: true, gap: 4 });
    if (section.description) {
      writeWrapped(section.description, { size: 9, color: [90, 90, 90], gap: 8 });
    }
    for (const entry of section.entries) {
      ensureSpace(60);
      writeWrapped(entry.path, { size: 11, bold: true, color: [30, 30, 90], gap: 2 });
      writeWrapped(`What it does: ${entry.does}`, { size: 9, gap: 2 });
      writeWrapped(`Layer(s): ${entry.layers.join(", ")}`, { size: 9, color: [60, 60, 60], gap: 2 });
      if (entry.notes) {
        writeWrapped(`Notes: ${entry.notes}`, { size: 9, color: [120, 60, 0], gap: 2 });
      }
      writeWrapped(`Recommendation: ${entry.recommendation}`, { size: 9, bold: true, color: [0, 90, 60], gap: 10 });
    }
    y += 6;
  }

  ensureSpace(40);
  writeWrapped("SQL pricing surface (reference)", { size: 14, bold: true, gap: 6 });
  for (const line of PRICING_INVENTORY_SQL_REFERENCE) {
    writeWrapped(`• ${line}`, { size: 9, gap: 3 });
  }

  y += 8;
  ensureSpace(40);
  writeWrapped("Cross-cutting findings", { size: 14, bold: true, gap: 6 });
  for (const line of PRICING_INVENTORY_FINDINGS) {
    writeWrapped(`• ${line}`, { size: 9, gap: 3 });
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 20, { align: "right" });
    doc.text("VPS Finest — Pricing Code Inventory", margin, pageH - 20);
  }

  const blob = doc.output("blob");
  const filename = `pricing-code-inventory-${PRICING_INVENTORY_GENERATED_AT}.pdf`;
  await saveAndLogDownload({
    blob,
    filename,
    kind: "admin_export",
    sourceLabel: "Pricing Code Inventory (PDF)",
  });
}

function PricingCodeInventoryPage() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"pdf" | "json" | null>(null);

  const totals = useMemo(() => {
    const all = PRICING_INVENTORY.flatMap((s) => s.entries);
    const counts: Record<Recommendation, number> = { KEEP: 0, CENTRALIZE: 0, EXPOSE: 0, LEGACY: 0 };
    for (const e of all) counts[e.recommendation]++;
    return { total: all.length, counts };
  }, []);

  const filteredSections = useMemo(() => {
    if (!query.trim()) return PRICING_INVENTORY;
    return PRICING_INVENTORY.map((s) => ({
      ...s,
      entries: s.entries.filter((e) => entryMatches(e, query.trim())),
    })).filter((s) => s.entries.length > 0);
  }, [query]);

  const onJson = async () => {
    setBusy("json");
    try {
      await downloadJson();
      toast.success("JSON export ready");
    } catch (e: any) {
      toast.error(e?.message ?? "JSON export failed");
    } finally {
      setBusy(null);
    }
  };

  const onPdf = async () => {
    setBusy("pdf");
    try {
      await downloadPdf();
      toast.success("PDF export ready");
    } catch (e: any) {
      toast.error(e?.message ?? "PDF export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing Code Inventory</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Read-only catalogue of every file that touches pricing, costing, units, conversions, inventory valuation,
            or quote pricing. Generated {PRICING_INVENTORY_GENERATED_AT}. Use this to map work for Phase Three pricing
            and the Item Cost Matrix without re-discovering existing logic.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onJson} disabled={busy !== null}>
            <FileJson className="size-4 mr-2" /> {busy === "json" ? "Exporting…" : "Download JSON"}
          </Button>
          <Button onClick={onPdf} disabled={busy !== null}>
            <Download className="size-4 mr-2" /> {busy === "pdf" ? "Exporting…" : "Download PDF"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total files" value={totals.total} />
        <StatCard label="KEEP" value={totals.counts.KEEP} tone="emerald" />
        <StatCard label="CENTRALIZE" value={totals.counts.CENTRALIZE} tone="blue" />
        <StatCard label="EXPOSE" value={totals.counts.EXPOSE} tone="violet" />
        <StatCard label="LEGACY" value={totals.counts.LEGACY} tone="amber" />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search path, layer, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredSections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            {section.description ? (
              <p className="text-xs text-muted-foreground">{section.description}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {section.entries.map((entry) => (
              <div key={entry.path} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <code className="text-xs font-mono break-all">{entry.path}</code>
                  <Badge variant="outline" className={RECO_COLORS[entry.recommendation]}>
                    {entry.recommendation}
                  </Badge>
                </div>
                <p className="text-sm">{entry.does}</p>
                <div className="flex flex-wrap gap-1">
                  {entry.layers.map((l) => (
                    <Badge key={l} variant="secondary" className="text-xs font-normal">{l}</Badge>
                  ))}
                </div>
                {entry.notes ? (
                  <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {entry.notes}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-4" /> SQL pricing surface (reference)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            {PRICING_INVENTORY_SQL_REFERENCE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cross-cutting findings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            {PRICING_INVENTORY_FINDINGS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "blue" | "violet" | "amber" }) {
  const toneClass =
    tone === "emerald" ? "text-emerald-700"
    : tone === "blue" ? "text-blue-700"
    : tone === "violet" ? "text-violet-700"
    : tone === "amber" ? "text-amber-700"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
