import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { PROJECT_AUDIT_MD, rowsToCsv, downloadFile } from "@/lib/admin/project-audit";
import { logAndDownload } from "@/lib/admin/log-download";
import { ROUTE_DESCRIPTIONS } from "@/lib/admin/page-descriptions";
import { runE2eAudit } from "@/lib/server-fns/e2e-audit.functions";
import { runDeepAudit, runPricingAudit } from "@/lib/server-fns/deep-audit.functions";
import { generatePricingV2FeasibilityReport } from "@/lib/server-fns/pricing-v2-feasibility-report.functions";
import { generatePricingV2OffEnrichmentExport } from "@/lib/server-fns/pricing-v2-off-enrichment.functions";
import jsPDF from "jspdf";

import { PageHelpCard } from "@/components/admin/PageHelpCard";
import { saveExportFile, type SavedExportFile } from "@/lib/admin/export-storage";

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

type ExportPhase = "generating" | "uploading" | "ready" | "error";
type ExportProgress = { phase: ExportPhase; message?: string };

function ExportsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedFiles, setSavedFiles] = useState<Record<string, SavedExportFile>>({});
  const [progress, setProgress] = useState<Record<string, ExportProgress | undefined>>({});

  const setPhase = (key: string, phase: ExportPhase, message?: string) =>
    setProgress((p) => ({ ...p, [key]: { phase, message } }));

  const [lastE2e, setLastE2e] = useState<{
    runId: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  } | null>(null);

  const runE2e = useServerFn(runE2eAudit);

  const today = new Date().toISOString().split("T")[0];

  const rememberSavedFile = (key: string, file: SavedExportFile) => {
    setSavedFiles((current) => ({ ...current, [key]: file }));
  };

  /**
   * Fetch the route_inventory table (HTTP status, last review, thumbnails)
   * and merge it with the static description registry so every audit bundle
   * carries the same shareable inventory snapshot.
   */
  async function fetchInventorySnapshot(): Promise<{
    rows: Array<{
      route_path: string;
      title: string | null;
      group: string;
      last_http_status: number | null;
      last_http_checked_at: string | null;
      last_http_error: string | null;
      review_status: string | null;
      review_notes: string | null;
      reviewed_at: string | null;
      thumbnail_url: string | null;
      thumbnail_captured_at: string | null;
    }>;
    fetched_at: string;
  }> {
    const { data, error: invErr } = await (supabase as any)
      .from("route_inventory")
      .select(
        "route_path, last_http_status, last_http_checked_at, last_http_error, review_status, review_notes, reviewed_at, thumbnail_url, thumbnail_captured_at",
      )
      .order("route_path");
    if (invErr) throw invErr;
    const byPath = new Map<string, any>();
    for (const r of data ?? []) byPath.set(r.route_path, r);

    const allPaths = Object.keys(ROUTE_DESCRIPTIONS);
    const rows = allPaths.map((p) => {
      const desc = (ROUTE_DESCRIPTIONS as any)[p] ?? {};
      const inv = byPath.get(p) ?? {};
      let group: string = "public";
      if (p.startsWith("/admin")) group = "admin";
      else if (p.startsWith("/employee")) group = "employee";
      else if (p === "/dashboard" || p === "/my-quotes" || p === "/my-events")
        group = "auth";
      else if (
        p.startsWith("/api/") ||
        p.startsWith("/hooks/") ||
        p.startsWith("/lovable/") ||
        p.startsWith("/email/")
      )
        group = "system";
      return {
        route_path: p,
        title: desc.title ?? null,
        group,
        last_http_status: inv.last_http_status ?? null,
        last_http_checked_at: inv.last_http_checked_at ?? null,
        last_http_error: inv.last_http_error ?? null,
        review_status: inv.review_status ?? null,
        review_notes: inv.review_notes ?? null,
        reviewed_at: inv.reviewed_at ?? null,
        thumbnail_url: inv.thumbnail_url ?? null,
        thumbnail_captured_at: inv.thumbnail_captured_at ?? null,
      };
    });
    return { rows, fetched_at: new Date().toISOString() };
  }

  function inventoryToMarkdown(snap: Awaited<ReturnType<typeof fetchInventorySnapshot>>): string {
    const lines: string[] = [];
    lines.push("");
    lines.push("## 8. AUDIT INVENTORY TABLE");
    lines.push("");
    lines.push(`_Snapshot of \`route_inventory\` taken ${snap.fetched_at}._`);
    lines.push("");
    const groups = ["public", "auth", "employee", "admin", "system"] as const;
    for (const g of groups) {
      const rowsInGroup = snap.rows.filter((r) => r.group === g);
      if (rowsInGroup.length === 0) continue;
      lines.push(`### ${g.charAt(0).toUpperCase() + g.slice(1)} (${rowsInGroup.length})`);
      lines.push("");
      lines.push("| Path | Title | HTTP | Checked | Review | Reviewed | Thumbnail |");
      lines.push("|---|---|---|---|---|---|---|");
      for (const r of rowsInGroup) {
        const httpCell =
          r.last_http_status != null
            ? String(r.last_http_status)
            : r.last_http_error
              ? `err`
              : "—";
        const checked = r.last_http_checked_at
          ? new Date(r.last_http_checked_at).toISOString().slice(0, 10)
          : "—";
        const reviewed = r.reviewed_at
          ? new Date(r.reviewed_at).toISOString().slice(0, 10)
          : "—";
        const thumb = r.thumbnail_url ? "✓" : "—";
        const title = (r.title ?? "").replace(/\|/g, "\\|");
        lines.push(
          `| \`${r.route_path}\` | ${title} | ${httpCell} | ${checked} | ${r.review_status ?? "unreviewed"} | ${reviewed} | ${thumb} |`,
        );
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  const handleRunE2e = async () => {
    setBusy("e2e");
    setError(null);
    try {
      const res = await runE2e({ data: {} });
      setLastE2e({
        runId: res.runId,
        total: res.total,
        passed: res.passed,
        failed: res.failed,
        skipped: res.skipped,
        durationMs: res.durationMs,
      });
      flashDone("e2e");
    } catch (e: any) {
      setError(e.message || "E2E audit run failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadMarkdown = async () => {
    setBusy("md");
    setError(null);
    setPhase("md", "generating", "Building markdown…");
    try {
      const snap = await fetchInventorySnapshot();
      const md = PROJECT_AUDIT_MD + "\n" + inventoryToMarkdown(snap);
      setPhase("md", "uploading", "Uploading to backend…");
      const saved = await saveExportFile(md, `PROJECT_AUDIT_${today}.md`, "text/markdown;charset=utf-8");
      rememberSavedFile("md", saved);
      setPhase("md", "ready");
      flashDone("md");
    } catch (e: any) {
      setError(e.message || "Markdown export failed");
      setPhase("md", "error", e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
    setPhase("pdf", "generating", "Rendering PDF…");
    try {
      const snap = await fetchInventorySnapshot();
      const fullMd = PROJECT_AUDIT_MD + "\n" + inventoryToMarkdown(snap);

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
      const lines = fullMd.split("\n");
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

      const pdfBlob = doc.output("blob");
      setPhase("pdf", "uploading", "Uploading to backend…");
      const saved = await saveExportFile(pdfBlob, `PROJECT_AUDIT_${today}.pdf`, "application/pdf");
      rememberSavedFile("pdf", saved);
      setPhase("pdf", "ready");
      flashDone("pdf");
    } catch (e: any) {
      setError(e.message || "PDF generation failed");
      setPhase("pdf", "error", e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadJson = async () => {
    setBusy("json");
    setError(null);
    setPhase("json", "generating", "Building JSON bundle…");
    try {
      const snap = await fetchInventorySnapshot();
      const bundle = {
        generated_at: new Date().toISOString(),
        project: "VP Finest",
        format_version: 2,
        markdown: PROJECT_AUDIT_MD + "\n" + inventoryToMarkdown(snap),
        routes: ROUTE_DESCRIPTIONS,
        route_count: Object.keys(ROUTE_DESCRIPTIONS).length,
        audit_inventory: {
          fetched_at: snap.fetched_at,
          row_count: snap.rows.length,
          rows: snap.rows,
        },
      };
      const json = JSON.stringify(bundle, null, 2);
      setPhase("json", "uploading", "Uploading to backend…");
      const saved = await saveExportFile(
        json,
        `PROJECT_AUDIT_${today}.json`,
        "application/json;charset=utf-8",
      );
      rememberSavedFile("json", saved);
      setPhase("json", "ready");
      flashDone("json");
    } catch (e: any) {
      setError(e.message || "JSON export failed");
      setPhase("json", "error", e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = async (spec: CsvSpec) => {
    setBusy(spec.key);
    setError(null);
    setPhase(spec.key, "generating", "Querying rows…");
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
        setPhase(spec.key, "generating", `Loaded ${all.length} rows…`);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      setPhase(spec.key, "uploading", `Uploading ${all.length} rows…`);
      if (all.length === 0) {
        const saved = await saveExportFile("(no rows)\n", spec.filename, "text/csv;charset=utf-8");
        rememberSavedFile(spec.key, saved);
      } else {
        const csv = rowsToCsv(all);
        const saved = await saveExportFile(csv, spec.filename, "text/csv;charset=utf-8");
        rememberSavedFile(spec.key, saved);
      }
      setPhase(spec.key, "ready");
      flashDone(spec.key);
    } catch (e: any) {
      setError(`${spec.label}: ${e.message || "Export failed"}`);
      setPhase(spec.key, "error", e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const handleExportAllCsv = async () => {
    setBusy("all");
    setError(null);
    try {
      for (const spec of CSV_EXPORTS) {
        setPhase(spec.key, "generating", "Querying rows…");
        const { data, error: e } = await (supabase as any)
          .from(spec.table)
          .select(spec.select)
          .range(0, 9999);
        if (e) {
          setPhase(spec.key, "error", e.message);
          throw e;
        }
        setPhase(spec.key, "uploading", `Uploading ${(data ?? []).length} rows…`);
        const csv = rowsToCsv(data ?? []);
        const saved = await saveExportFile(csv, spec.filename, "text/csv;charset=utf-8");
        rememberSavedFile(spec.key, saved);
        setPhase(spec.key, "ready");
        await new Promise((r) => setTimeout(r, 100));
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
            actions, AI workflows, KPIs, auth model, and environment, plus a
            live snapshot of the page-inventory table (HTTP status, last
            review, thumbnails). Useful as context for Copilot, Cursor, or
            onboarding documents.
          </p>
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-medium">Page Inventory</div>
              <div className="text-xs text-muted-foreground">
                Visual sweep of every route — HTTP status, last review, and thumbnails.
              </div>
            </div>
            <Link
              to="/admin/page-inventory"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open inventory →
            </Link>
          </div>
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
            <Button
              onClick={handleDownloadJson}
              disabled={!!busy}
              variant="outline"
              className="gap-2"
            >
              {busy === "json" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : done.json ? (
                <Check className="w-4 h-4" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Download JSON bundle
            </Button>
          </div>
          <div className="space-y-2">
            {(["md", "pdf", "json"] as const).map((key) => {
              const file = savedFiles[key];
              const prog = progress[key];
              if (!file && !prog) return null;
              return (
                <ExportProgressLine
                  key={key}
                  label={key === "md" ? "Markdown" : key === "pdf" ? "PDF" : "JSON bundle"}
                  progress={prog}
                  file={file}
                />
              );
            })}
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-sm">E2E checklist</div>
                <div className="text-xs text-muted-foreground">
                  Runs the source-derived checklist (renders / loads data /
                  primary action) plus a live HTTP sweep of every public route,
                  then saves the run to history.
                </div>
              </div>
              <Button
                onClick={handleRunE2e}
                disabled={!!busy}
                size="sm"
                className="gap-2 shrink-0"
              >
                {busy === "e2e" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : done.e2e ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                Run E2E & save
              </Button>
            </div>
            {lastE2e && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="font-mono">
                  {lastE2e.total} routes
                </Badge>
                <Badge className="bg-primary/15 text-primary border-transparent">
                  ✓ {lastE2e.passed} passed
                </Badge>
                {lastE2e.failed > 0 && (
                  <Badge variant="destructive">
                    ✗ {lastE2e.failed} failed
                  </Badge>
                )}
                {lastE2e.skipped > 0 && (
                  <Badge variant="outline">
                    ➖ {lastE2e.skipped} skipped
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  in {(lastE2e.durationMs / 1000).toFixed(1)}s · saved as run{" "}
                  <code className="font-mono">{lastE2e.runId.slice(0, 8)}</code>
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Deep audit (live snapshot + mega prompt) */}
      <DeepAuditCard />

      {/* Pricing pipeline diagnostic */}
      <PricingAuditCard />

      {/* Kroger raw API data */}
      <KrogerRawExportCard />

      {/* Pricing v2 — Data Feasibility & Rule Design */}
      <PricingV2FeasibilityCard />

      {/* Pricing v2 — Open Food Facts UPC Enrichment */}
      <PricingV2OffEnrichmentCard />

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
            {CSV_EXPORTS.map((spec) => {
              const prog = progress[spec.key];
              const file = savedFiles[spec.key];
              return (
                <div
                  key={spec.key}
                  className="border border-border/60 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
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
                  {(prog || file) && (
                    <ExportProgressLine label={spec.label} progress={prog} file={file} compact />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportProgressLine({
  label,
  progress,
  file,
  compact = false,
}: {
  label: string;
  progress?: ExportProgress;
  file?: SavedExportFile;
  compact?: boolean;
}) {
  const phase = progress?.phase ?? (file ? "ready" : "generating");
  const isError = phase === "error";
  const isReady = phase === "ready" && !!file;
  const inFlight = phase === "generating" || phase === "uploading";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        isError
          ? "border-destructive/40 bg-destructive/5"
          : isReady
            ? "border-primary/30 bg-primary/5"
            : "border-border/60 bg-muted/30"
      }`}
    >
      <div className="min-w-0 flex items-center gap-2">
        {inFlight && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
        {isReady && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
        <div className="min-w-0">
          {!compact && <div className="font-medium truncate">{file?.filename ?? label}</div>}
          <div className={`text-xs ${isError ? "text-destructive" : "text-muted-foreground"} truncate`}>
            {phase === "generating" && (progress?.message || "Generating…")}
            {phase === "uploading" && (progress?.message || "Uploading…")}
            {phase === "ready" && (file ? "Saved to backend files" : "Ready")}
            {phase === "error" && (progress?.message || "Failed")}
          </div>
        </div>
      </div>
      {isReady && file && (
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline shrink-0"
        >
          Open file
        </a>
      )}
    </div>
  );
}

// ---- Deep Audit card -----------------------------------------------------

function DeepAuditCard() {
  const runFn = useServerFn(runDeepAudit);
  const [loading, setLoading] = useState(false);
  const [auditText, setAuditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setAuditText("");
    setGeneratedAt(null);
    try {
      const res = await runFn();
      setAuditText(res.text);
      setGeneratedAt(res.generated_at);
    } catch (e: any) {
      setError(e?.message ?? "Deep audit failed");
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    if (!auditText || downloading) return;
    const stamp = (generatedAt ?? new Date().toISOString()).replace(/[:.]/g, "-");
    const filename = `deep-audit-${stamp}.md`;
    setDownloading(true);
    const toastId = toast.loading(`Preparing ${filename}…`);
    try {
      const res = await logAndDownload({
        content: auditText,
        filename,
        mimeType: "text/markdown",
        kind: "audit_export",
        module: "audit",
        recordCount: auditText.length,
        parameters: { promptVersion: "deep-audit", generatedAt },
        sourceLabel: "Deep audit (AI-ready)",
      });
      // Also persist into project_audit_exports for diffing.
      try {
        const { data: sess } = await supabase.auth.getSession();
        await (supabase as any).from("project_audit_exports").insert({
          prompt_version: "deep-audit",
          output_filename: filename,
          output_content: auditText,
          executed_by: sess.session?.user?.id ?? null,
        });
      } catch { /* ignore */ }
      toast.success("Deep audit downloaded", {
        id: toastId,
        description: res.persisted ? `${filename} · saved to Files & Reports` : filename,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        const msg = e?.message || "Download failed";
        setError(msg);
        toast.error("Download failed", { id: toastId, description: msg });
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Deep audit (AI-ready)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Generates a live snapshot — public schema, RLS policies, server
          functions, route inventory, configured integrations (names only),
          and a 7-day error-log summary — prepended with a principal-architect
          audit prompt tailored to this stack. Paste the downloaded file into
          GPT / Claude / Copilot for a structured security &amp; architecture
          review.
        </p>

        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">No secrets are emitted.</strong>{" "}
          Integration entries list configured-vs-missing only — never values.
          Admin-only.
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={run} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            {loading ? "Running deep audit…" : "Run deep audit"}
          </Button>
          <Button
            onClick={download}
            disabled={!auditText || downloading}
            variant="outline"
            className="gap-2"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading ? "Preparing download…" : "Download .md"}
          </Button>
          {auditText && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {auditText.length.toLocaleString()} chars
              {generatedAt && ` · ${new Date(generatedAt).toLocaleTimeString()}`}
            </Badge>
          )}
        </div>

        {auditText && (
          <details className="rounded-md border border-border/60 bg-muted/30">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Preview (first 4 KB)
            </summary>
            <pre className="px-3 pb-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-80 overflow-auto">
              {auditText.slice(0, 4000)}
              {auditText.length > 4000 ? "\n\n…(truncated — download for full)" : ""}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Pricing Audit card --------------------------------------------------

function PricingAuditCard() {
  const runFn = useServerFn(runPricingAudit);
  const [loading, setLoading] = useState(false);
  const [auditText, setAuditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setAuditText("");
    setGeneratedAt(null);
    try {
      const res = await runFn();
      setAuditText(res.text);
      setGeneratedAt(res.generated_at);
    } catch (e: any) {
      setError(e?.message ?? "Pricing audit failed");
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    if (!auditText || downloading) return;
    const stamp = (generatedAt ?? new Date().toISOString()).replace(/[:.]/g, "-");
    const filename = `pricing-audit-${stamp}.md`;
    setDownloading(true);
    const toastId = toast.loading(`Preparing ${filename}…`);
    try {
      const res = await logAndDownload({
        content: auditText,
        filename,
        mimeType: "text/markdown",
        kind: "audit_export",
        module: "pricing",
        recordCount: auditText.length,
        parameters: { promptVersion: "pricing-audit", generatedAt },
        sourceLabel: "Pricing pipeline audit",
      });
      toast.success("Pricing audit downloaded", {
        id: toastId,
        description: res.persisted ? `${filename} · saved to Files & Reports` : filename,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.dismiss(toastId);
      } else {
        const msg = e?.message || "Download failed";
        setError(msg);
        toast.error("Download failed", { id: toastId, description: msg });
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Pricing pipeline audit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Focused diagnostic for pricing-v2: inventory ↔ Kroger mapping
          coverage, bootstrap state, recent run outcomes, item-catalog quality,
          a 7-day error breakdown, and ranked next actions. Answers
          &ldquo;why aren&rsquo;t items landing in the catalog?&rdquo;
        </p>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={run} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            {loading ? "Running pricing audit…" : "Run pricing audit"}
          </Button>
          <Button
            onClick={download}
            disabled={!auditText || downloading}
            variant="outline"
            className="gap-2"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading ? "Preparing download…" : "Download .md"}
          </Button>
          {auditText && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {auditText.length.toLocaleString()} chars
              {generatedAt && ` · ${new Date(generatedAt).toLocaleTimeString()}`}
            </Badge>
          )}
        </div>

        {auditText && (
          <details className="rounded-md border border-border/60 bg-muted/30" open>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Preview
            </summary>
            <pre className="px-3 pb-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-96 overflow-auto">
              {auditText.slice(0, 8000)}
              {auditText.length > 8000 ? "\n\n…(truncated — download for full)" : ""}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Kroger raw API data card --------------------------------------------

function KrogerRawExportCard() {
  const [busy, setBusy] = useState<null | "csv" | "json" | "xlsx">(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [savedCsv, setSavedCsv] = useState<SavedExportFile | null>(null);
  const [savedJson, setSavedJson] = useState<SavedExportFile | null>(null);
  const [savedXlsx, setSavedXlsx] = useState<SavedExportFile | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  function flattenRows(rows: any[]) {
    return rows.map((r) => {
      const p = r.payload_json ?? {};
      const item0 = Array.isArray(p.items) ? p.items[0] : null;
      return {
        id: r.id,
        fetched_at: r.fetched_at,
        store_id: r.store_id,
        kroger_product_id: r.kroger_product_id,
        upc: r.upc,
        name: r.name,
        brand: r.brand,
        size_raw: r.size_raw,
        sold_by: item0?.soldBy ?? null,
        price_regular: item0?.price?.regular ?? null,
        price_promo: item0?.price?.promo ?? null,
        probe_keyword: p._probe_keyword ?? null,
        probe_fetched_at: p._probe_fetched_at ?? null,
      };
    });
  }

  const handleXlsx = async () => {
    setBusy("xlsx");
    setError(null);
    setSavedXlsx(null);
    try {
      const rows = await loadAllRaw();
      const flat = flattenRows(rows);
      setProgressMsg(`Building workbook (${flat.length} rows)…`);
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const wsFlat = XLSX.utils.json_to_sheet(flat);
      XLSX.utils.book_append_sheet(wb, wsFlat, "Products (flat)");
      // Second sheet: raw payloads as JSON strings (Excel-safe)
      const rawSheet = XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          id: r.id,
          kroger_product_id: r.kroger_product_id,
          name: r.name,
          payload_json: JSON.stringify(r.payload_json ?? {}),
        })),
      );
      XLSX.utils.book_append_sheet(wb, rawSheet, "Raw payloads");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      setProgressMsg(`Uploading ${flat.length} rows…`);
      const filename = `kroger_raw_${new Date().toISOString().split("T")[0]}.xlsx`;
      const saved = await saveExportFile(
        blob,
        filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      setSavedXlsx(saved);
      setProgressMsg("");
      // Local download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      setError(e?.message || "Kroger Excel export failed");
    } finally {
      setBusy(null);
    }
  };

  async function loadAllRaw() {
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error: e } = await (supabase as any)
        .from("pricing_v2_kroger_catalog_raw")
        .select(
          "id, run_id, store_id, kroger_product_id, upc, name, brand, size_raw, fetched_at, payload_json",
        )
        .order("fetched_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (e) throw e;
      const batch = data ?? [];
      all.push(...batch);
      setProgressMsg(`Loaded ${all.length} rows…`);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    setRowCount(all.length);
    return all;
  }

  const handleCsv = async () => {
    setBusy("csv");
    setError(null);
    setSavedCsv(null);
    try {
      const rows = await loadAllRaw();
      const flat = flattenRows(rows);
      setProgressMsg(`Uploading ${flat.length} rows…`);
      const csv = rowsToCsv(flat);
      const saved = await saveExportFile(
        csv,
        `kroger_raw_${new Date().toISOString().split("T")[0]}.csv`,
        "text/csv;charset=utf-8",
      );
      setSavedCsv(saved);
      setProgressMsg("");
      // Also trigger a local download for convenience.
      await downloadFile(csv, saved.filename, "text/csv;charset=utf-8");
    } catch (e: any) {
      setError(e?.message || "Kroger CSV export failed");
    } finally {
      setBusy(null);
    }
  };

  const handleJson = async () => {
    setBusy("json");
    setError(null);
    setSavedJson(null);
    try {
      const rows = await loadAllRaw();
      const bundle = {
        generated_at: new Date().toISOString(),
        source_table: "pricing_v2_kroger_catalog_raw",
        row_count: rows.length,
        rows,
      };
      const json = JSON.stringify(bundle, null, 2);
      setProgressMsg(`Uploading ${rows.length} rows…`);
      const saved = await saveExportFile(
        json,
        `kroger_raw_${new Date().toISOString().split("T")[0]}.json`,
        "application/json;charset=utf-8",
      );
      setSavedJson(saved);
      setProgressMsg("");
      await downloadFile(json, saved.filename, "application/json;charset=utf-8");
    } catch (e: any) {
      setError(e?.message || "Kroger JSON export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" /> Kroger raw API data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Every raw product payload captured from the Kroger Products API
          (table <code className="font-mono text-xs">pricing_v2_kroger_catalog_raw</code>).
          Unmodified — exactly what Kroger returned, including size string,
          regular/promo price, and the keyword that surfaced each item.
          JSON preserves the full payload; CSV flattens to the most-used fields.
        </p>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleJson} disabled={!!busy} className="gap-2">
            {busy === "json" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            Download JSON (full payload)
          </Button>
          <Button
            onClick={handleCsv}
            disabled={!!busy}
            variant="outline"
            className="gap-2"
          >
            {busy === "csv" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download CSV (flat)
          </Button>
          <Button
            onClick={handleXlsx}
            disabled={!!busy}
            variant="outline"
            className="gap-2"
          >
            {busy === "xlsx" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            Download Excel (.xlsx)
          </Button>
          {rowCount !== null && (
            <Badge variant="secondary" className="font-mono text-[10px] self-center">
              {rowCount.toLocaleString()} rows
            </Badge>
          )}
        </div>

        {busy && progressMsg && (
          <div className="text-xs text-muted-foreground">{progressMsg}</div>
        )}

        {savedJson && (
          <ExportProgressLine label="Kroger JSON" file={savedJson} />
        )}
        {savedCsv && (
          <ExportProgressLine label="Kroger CSV" file={savedCsv} />
        )}
        {savedXlsx && (
          <ExportProgressLine label="Kroger Excel" file={savedXlsx} />
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------
// Pricing v2 — Data Feasibility & Rule Design
// Read-only analytical report. Does NOT modify or normalize raw data.
// ----------------------------------------------------------------------
function PricingV2FeasibilityCard() {
  const generate = useServerFn(generatePricingV2FeasibilityReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [saved, setSaved] = useState<SavedExportFile | null>(null);

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await generate();
      setSummary(res.summary);
      const savedFile = await saveExportFile(
        res.markdown,
        res.filename,
        "text/markdown;charset=utf-8",
      );
      setSaved(savedFile);
      await logAndDownload({
        content: res.markdown,
        filename: res.filename,
        mimeType: "text/markdown;charset=utf-8",
        kind: "admin_export",
        module: "exports",
        parameters: { type: "pricing_v2_feasibility_report" },
      });
      toast.success("Feasibility report generated");
    } catch (e: any) {
      setError(e?.message || "Failed to generate report");
      toast.error(e?.message || "Failed to generate report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Pricing v2 — Data Feasibility &amp; Rule Design
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Read-only analysis of <code className="font-mono text-xs">pricing_v2_kroger_catalog_raw</code>.
          Reports what percentage of the raw Kroger catalog can be safely
          normalized, broken down by representation type, keyword category,
          and feasibility tier. <strong>No normalization, conversions, totals,
          or pricing decisions are performed.</strong>
        </p>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleRun} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Generate report (Markdown)
          </Button>
          {summary && (
            <Badge variant="secondary" className="font-mono text-[10px] self-center">
              {Number(summary.total).toLocaleString()} rows · {summary.distinct_keywords} keywords
            </Badge>
          )}
        </div>

        {summary && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
            <div className="font-semibold text-sm">Quick summary</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div><span className="text-muted-foreground">Weight-only:</span> {summary.representation.weight_only}</div>
              <div><span className="text-muted-foreground">Count-only:</span> {summary.representation.count_only}</div>
              <div><span className="text-muted-foreground">Count+weight:</span> {summary.representation.count_and_weight}</div>
              <div><span className="text-muted-foreground">Volume:</span> {summary.representation.volume}</div>
              <div><span className="text-muted-foreground">Ambiguous:</span> {summary.representation.ambiguous} ({summary.ambiguous_pct})</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1 border-t">
              <div><span className="text-muted-foreground">Tier 1:</span> {summary.tiers.tier_1}</div>
              <div><span className="text-muted-foreground">Tier 2:</span> {summary.tiers.tier_2}</div>
              <div><span className="text-muted-foreground">Tier 3:</span> {summary.tiers.tier_3}</div>
              <div><span className="text-muted-foreground">Tier 4:</span> {summary.tiers.tier_4}</div>
              <div><span className="text-muted-foreground">Tier 5:</span> {summary.tiers.tier_5}</div>
            </div>
          </div>
        )}

        {saved && <ExportProgressLine label="Feasibility report" file={saved} />}
      </CardContent>
    </Card>
  );
}


function PricingV2OffEnrichmentCard() {
  const generate = useServerFn(generatePricingV2OffEnrichmentExport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await generate();
      setSummary(res.summary);
      setLastRun(res.summary.last_run_at);

      // Decode base64 to Blob and trigger download + log.
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      await logAndDownload({
        content: blob,
        filename: res.filename,
        mimeType: blob.type,
        kind: "admin_export",
        module: "exports",
        parameters: { type: "pricing_v2_off_enrichment" },
      });
      toast.success("OFF enrichment export ready");
    } catch (e: any) {
      setError(e?.message || "Failed to generate export");
      toast.error(e?.message || "Failed to generate export");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Pricing v2 — Open Food Facts UPC Enrichment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Read-only enrichment of <code className="font-mono text-xs">pricing_v2_kroger_catalog_raw</code>{" "}
          using the public Open Food Facts API. Adds descriptive product context
          (brand, category, quantity hints) side-by-side with Kroger fields —{" "}
          <strong>no merging, no overwriting, no normalization, no pricing impact.</strong>{" "}
          Results are cached for 30 days.
        </p>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={handleRun} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Generate enrichment export (Excel)
          </Button>
          {lastRun && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              Last run: {new Date(lastRun).toLocaleString()}
            </Badge>
          )}
        </div>

        {summary && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
            <div className="font-semibold text-sm">Run summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span className="text-muted-foreground">Raw rows:</span> {Number(summary.total_raw_rows).toLocaleString()}</div>
              <div><span className="text-muted-foreground">Distinct UPCs:</span> {Number(summary.total_upcs).toLocaleString()}</div>
              <div><span className="text-muted-foreground">Found:</span> {summary.found}</div>
              <div><span className="text-muted-foreground">Not found:</span> {summary.not_found}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t">
              <div><span className="text-muted-foreground">High:</span> {summary.confidence.high}</div>
              <div><span className="text-muted-foreground">Medium:</span> {summary.confidence.medium}</div>
              <div><span className="text-muted-foreground">Low:</span> {summary.confidence.low}</div>
              <div><span className="text-muted-foreground">None:</span> {summary.confidence.none}</div>
            </div>
            <div className="text-muted-foreground pt-1 border-t">
              Newly fetched this run: {summary.newly_fetched}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
