import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
} from "lucide-react";
import { PROJECT_AUDIT_MD, rowsToCsv } from "@/lib/admin/project-audit";
import { ROUTE_DESCRIPTIONS } from "@/lib/admin/page-descriptions";
import { runE2eAudit } from "@/lib/server-fns/e2e-audit.functions";
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

function ExportsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedFiles, setSavedFiles] = useState<Record<string, SavedExportFile>>({});
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
    try {
      const snap = await fetchInventorySnapshot();
      const md = PROJECT_AUDIT_MD + "\n" + inventoryToMarkdown(snap);
      const saved = await saveExportFile(md, `PROJECT_AUDIT_${today}.md`, "text/markdown;charset=utf-8");
      rememberSavedFile("md", saved);
      flashDone("md");
    } catch (e: any) {
      setError(e.message || "Markdown export failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
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
      const saved = await saveExportFile(pdfBlob, `PROJECT_AUDIT_${today}.pdf`, "application/pdf");
      rememberSavedFile("pdf", saved);
      flashDone("pdf");
    } catch (e: any) {
      setError(e.message || "PDF generation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadJson = async () => {
    setBusy("json");
    setError(null);
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
      const saved = await saveExportFile(
        json,
        `PROJECT_AUDIT_${today}.json`,
        "application/json;charset=utf-8",
      );
      rememberSavedFile("json", saved);
      flashDone("json");
    } catch (e: any) {
      setError(e.message || "JSON export failed");
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
        const saved = await saveExportFile("(no rows)\n", spec.filename, "text/csv;charset=utf-8");
        rememberSavedFile(spec.key, saved);
      } else {
        const csv = rowsToCsv(all);
        const saved = await saveExportFile(csv, spec.filename, "text/csv;charset=utf-8");
        rememberSavedFile(spec.key, saved);
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
        if (e) {
          throw e;
        }
        const csv = rowsToCsv(data ?? []);
        const saved = await saveExportFile(csv, spec.filename, "text/csv;charset=utf-8");
        rememberSavedFile(spec.key, saved);
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
              if (!file) return null;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{file.filename}</div>
                    <div className="text-xs text-muted-foreground">Saved to backend files</div>
                  </div>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline shrink-0"
                  >
                    Open file
                  </a>
                </div>
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
                {savedFiles[spec.key] && (
                  <a
                    href={savedFiles[spec.key].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    Open
                  </a>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
