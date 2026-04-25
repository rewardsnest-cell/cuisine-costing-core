import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listIngestDiagnostics } from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/ingest-diagnostics")({
  head: () => ({
    meta: [
      { title: "Ingest Diagnostics — Admin" },
      {
        name: "description",
        content:
          "Per-ingredient ingest diagnostics: searched term, match confidence, mapped inventory item, and CSV export.",
      },
    ],
  }),
  component: IngestDiagnosticsPage,
});

type ReviewState = "all" | "confirmed" | "pending" | "unmatched" | "rejected";

type Row = Awaited<ReturnType<typeof listIngestDiagnostics>>[number];

function stateBadge(state: string) {
  const map: Record<string, string> = {
    confirmed: "bg-success text-success-foreground",
    pending: "bg-warning text-warning-foreground",
    unmatched: "bg-muted text-muted-foreground",
    rejected: "bg-destructive text-destructive-foreground",
  };
  return <Badge className={map[state] ?? "bg-muted text-muted-foreground"}>{state}</Badge>;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows: Row[]) {
  const headers = [
    "sku",
    "product_name",
    "searched_term",
    "review_state",
    "match_confidence",
    "reference_name",
    "inventory_item_name",
    "inventory_item_unit",
    "price_unit_size",
    "last_seen_at",
    "reason",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.sku,
        r.product_name,
        r.searched_term,
        r.review_state,
        r.match_confidence ?? "",
        r.reference_name ?? "",
        r.inventory_item_name ?? "",
        r.inventory_item_unit ?? "",
        r.price_unit_size ?? "",
        r.last_seen_at,
        r.reason,
      ].map(csvEscape).join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ingest-diagnostics-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function IngestDiagnosticsPage() {
  const [reviewState, setReviewState] = useState<ReviewState>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useMemo(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["ingest-diagnostics", reviewState, debouncedSearch],
    queryFn: () =>
      listIngestDiagnostics({
        data: {
          review_state: reviewState,
          search: debouncedSearch || undefined,
          limit: 1000,
        },
      }),
  });

  const rows: Row[] = query.data ?? [];

  const counts = useMemo(() => {
    const c = { confirmed: 0, pending: 0, unmatched: 0, rejected: 0 };
    for (const r of rows) {
      if (r.review_state in c) c[r.review_state as keyof typeof c]++;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin">
              <Button size="sm" variant="ghost" className="gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Admin
              </Button>
            </Link>
          </div>
          <h1 className="font-display text-2xl font-bold">Ingest Diagnostics</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Why each Kroger SKU is in its current matching state — the term we scored against,
            the confidence we computed, and the inventory item it maps to (if any). Export the
            current view to CSV for offline review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => downloadCsv(rows)}
            disabled={rows.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Confirmed" value={counts.confirmed} tone="success" />
        <SummaryCard label="Pending" value={counts.pending} tone="warning" />
        <SummaryCard label="Unmatched" value={counts.unmatched} tone="muted" />
        <SummaryCard label="Rejected" value={counts.rejected} tone="destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>Narrow by review state or search by SKU / product name.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Select value={reviewState} onValueChange={(v) => setReviewState(v as ReviewState)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Review state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search SKU or product name…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground">{rows.length} rows</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-6">
              <LoadingState message="Loading diagnostics…" />
            </div>
          ) : query.isError ? (
            <div className="p-6 text-sm text-destructive">
              Failed to load: {(query.error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No SKUs match the current filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead>Product (Kroger)</TableHead>
                    <TableHead>Searched term</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                    <TableHead>Mapped inventory item</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{stateBadge(r.review_state)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate" title={r.product_name ?? ""}>
                          {r.product_name ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{r.sku}</div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="text-xs font-mono text-muted-foreground break-words">
                          {r.searched_term ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.match_confidence != null ? r.match_confidence.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {r.inventory_item_name ? (
                          <div>
                            <div className="font-medium truncate" title={r.inventory_item_name}>
                              {r.inventory_item_name}
                            </div>
                            {r.inventory_item_unit && (
                              <div className="text-xs text-muted-foreground">
                                unit: {r.inventory_item_unit}
                              </div>
                            )}
                          </div>
                        ) : r.reference_name ? (
                          <span className="text-xs italic text-muted-foreground">
                            ref: {r.reference_name} (no inventory link)
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[320px]">
                        {r.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "muted" | "destructive";
}) {
  const toneCls = {
    success: "text-success",
    warning: "text-warning",
    muted: "text-muted-foreground",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
