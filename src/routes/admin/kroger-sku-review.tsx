import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, Check, X, RotateCcw, Link2, ListChecks, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listKrogerSkuMap,
  searchIngredientReferences,
  confirmKrogerSkuMapping,
  listKrogerRuns,
  listKrogerRunSkus,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-sku-review")({
  head: () => ({ meta: [{ title: "Kroger SKU Review — Admin" }] }),
  component: KrogerSkuReviewPage,
});

type Row = Awaited<ReturnType<typeof listKrogerSkuMap>>[number];
type RefRow = Awaited<ReturnType<typeof searchIngredientReferences>>[number];

function KrogerSkuReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unmapped" | "confirmed" | "rejected" | "all">("unmapped");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listKrogerSkuMap({
        data: {
          status: filter === "all" ? undefined : filter,
          search: search.trim() || undefined,
          limit: 200,
        },
      });
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load SKU map");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const counts = useMemo(() => {
    const c = { unmapped: 0, confirmed: 0, rejected: 0 };
    for (const r of rows) {
      if (r.status === "unmapped" || r.status === "confirmed" || r.status === "rejected") {
        c[r.status]++;
      }
    }
    return c;
  }, [rows]);

  const onAction = async (id: string, status: "confirmed" | "rejected" | "unmapped", reference_id: string | null) => {
    setBusyId(id);
    try {
      await confirmKrogerSkuMapping({ data: { id, status, reference_id } });
      toast.success(
        status === "confirmed" ? "SKU mapped to ingredient" :
        status === "rejected" ? "SKU rejected" :
        "SKU returned to unmapped",
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Kroger SKU Review</h1>
        <p className="text-sm text-muted-foreground">
          Confirm or reject Kroger SKUs. Confirmed mappings are linked to an ingredient reference for stronger price signals.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="unmapped">Unmapped</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <form
          className="flex items-center gap-2 ml-auto"
          onSubmit={(e) => { e.preventDefault(); load(); }}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or product…"
              className="pl-7 h-9 w-64"
            />
          </div>
          <Button size="sm" type="submit" variant="outline">Search</Button>
        </form>
      </div>

      <RunSkuExportCard />

      <MatchingBreakdown rows={rows} loading={loading} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-3">
            <span>{filter === "all" ? "All SKUs" : filter[0].toUpperCase() + filter.slice(1)}</span>
            <Badge variant="outline" className="text-xs">{rows.length} shown</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SKUs in this view.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Identifiers</TableHead>
                    <TableHead className="text-right">Prices</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked ingredient</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <SkuRow
                      key={r.id}
                      row={r}
                      busy={busyId === r.id}
                      onAction={onAction}
                    />
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

function SkuRow({ row, busy, onAction }: { row: Row; busy: boolean; onAction: (id: string, status: "confirmed" | "rejected" | "unmapped", refId: string | null) => void }) {
  const r = row as any;
  const upc: string | null = r.upc ?? null;
  const productId: string | null = r.product_id ?? null;
  const regular: number | null = r.regular_price ?? null;
  const promo: number | null = r.promo_price ?? null;
  const unitSize: string | null = r.price_unit_size ?? null;
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
      <TableCell className="max-w-md">
        <div className="text-sm font-medium truncate">{row.product_name ?? "—"}</div>
        {row.notes && <div className="text-xs text-muted-foreground truncate">{row.notes}</div>}
      </TableCell>
      <TableCell className="font-mono text-[11px] leading-tight">
        {upc || productId ? (
          <div className="space-y-0.5">
            {upc && (
              <div className="whitespace-nowrap" title="Kroger UPC">
                <span className="text-muted-foreground">UPC </span>
                {upc}
              </div>
            )}
            {productId && productId !== upc && (
              <div className="whitespace-nowrap" title="Kroger productId">
                <span className="text-muted-foreground">PID </span>
                {productId}
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs leading-tight">
        {regular == null && promo == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="space-y-0.5">
            {regular != null && (
              <div className="whitespace-nowrap">
                <span className="text-muted-foreground">reg </span>
                ${regular.toFixed(2)}
              </div>
            )}
            {promo != null && (
              <div className="whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                <span className="text-muted-foreground">promo </span>
                ${promo.toFixed(2)}
              </div>
            )}
            {unitSize && (
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">{unitSize}</div>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell>
        {row.reference_id ? (
          <Badge variant="secondary" className="gap-1"><Link2 className="w-3 h-3" />{(row as any).reference_name ?? row.reference_id.slice(0, 8)}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(row.last_seen_at).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          {row.status !== "confirmed" && (
            <ConfirmPopover
              row={row}
              busy={busy}
              onConfirm={(refId) => onAction(row.id, "confirmed", refId)}
            />
          )}
          {row.status !== "rejected" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(row.id, "rejected", null)} className="gap-1 h-7">
              <X className="w-3 h-3" /> Reject
            </Button>
          )}
          {row.status !== "unmapped" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(row.id, "unmapped", null)} className="gap-1 h-7">
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ConfirmPopover({ row, busy, onConfirm }: { row: Row; busy: boolean; onConfirm: (refId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(row.product_name ?? "");
  const [results, setResults] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (search.trim().length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const r = await searchIngredientReferences({ data: { search: search.trim(), limit: 20 } });
        setResults(r);
      } catch (e: any) {
        toast.error(e?.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="default" disabled={busy} className="gap-1 h-7">
          <Check className="w-3 h-3" /> Confirm
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-2">
        <div className="text-xs font-medium">Link to ingredient reference</div>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ingredient name…"
          className="h-8"
        />
        <div className="max-h-60 overflow-auto border rounded">
          {loading ? (
            <div className="p-2 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">{search.trim().length < 2 ? "Type 2+ characters" : "No matches"}</div>
          ) : results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted border-b last:border-0"
              onClick={() => { onConfirm(r.id); setOpen(false); }}
            >
              <div className="font-medium">{r.canonical_name}</div>
              <div className="text-muted-foreground text-[10px]">unit: {r.default_unit}{r.inventory_item_id ? " · linked to inventory" : ""}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "confirmed" ? "secondary" :
    status === "rejected" ? "destructive" :
    status === "suggested" ? "default" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function classifyUnmatchedReason(row: Row): { code: string; label: string } {
  if (!row.product_name || !row.product_name.trim()) {
    return { code: "missing_name", label: "No product name from Kroger" };
  }
  if (row.status === "rejected") {
    return { code: "rejected", label: "Manually rejected" };
  }
  const conf = row.match_confidence;
  if (conf == null) {
    return { code: "no_suggestion", label: "No ingredient suggestion found" };
  }
  if (conf < 0.5) {
    return { code: "low_confidence", label: `Low confidence (${(conf * 100).toFixed(0)}%) — needs review` };
  }
  return { code: "awaiting_review", label: `Suggested (${(conf * 100).toFixed(0)}%) — awaiting confirmation` };
}

function MatchingBreakdown({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.status === "confirmed" && r.reference_id);
    const unmatched = rows.filter((r) => !(r.status === "confirmed" && r.reference_id));
    const reasonGroups = new Map<string, { label: string; count: number; samples: Row[] }>();
    for (const r of unmatched) {
      const { code, label } = classifyUnmatchedReason(r);
      const existing = reasonGroups.get(code);
      if (existing) {
        existing.count++;
        if (existing.samples.length < 3) existing.samples.push(r);
      } else {
        reasonGroups.set(code, { label, count: 1, samples: [r] });
      }
    }
    const reasons = Array.from(reasonGroups.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.count - a.count);
    return { matched, unmatched, reasons };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          Matching breakdown
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Summary of which SKUs in the current view linked to an inventory ingredient and why others didn't.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SKUs in this view.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border rounded-md">
              <div className="px-3 py-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide flex items-center justify-between">
                <span>Matched ({summary.matched.length})</span>
                {summary.matched.length > 0 && (
                  <span className="text-muted-foreground normal-case font-normal">Showing top {Math.min(8, summary.matched.length)}</span>
                )}
              </div>
              {summary.matched.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No confirmed matches in this view.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Inventory ingredient</TableHead>
                      <TableHead className="text-xs">Matched on (Kroger name)</TableHead>
                      <TableHead className="text-xs text-right">Conf.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.matched.slice(0, 8).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-medium">
                          {(r as any).reference_name ?? <span className="text-muted-foreground">(unnamed)</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[18rem] truncate" title={r.product_name ?? ""}>
                          {r.product_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {r.match_confidence == null ? "—" : `${(r.match_confidence * 100).toFixed(0)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="border rounded-md">
              <div className="px-3 py-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide">
                Unmatched ({summary.unmatched.length}) — reason
              </div>
              {summary.reasons.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">Everything in this view is matched 🎉</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">Examples</TableHead>
                      <TableHead className="text-xs text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.reasons.map((g) => (
                      <TableRow key={g.code}>
                        <TableCell className="text-xs font-medium align-top">{g.label}</TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top">
                          <ul className="space-y-0.5">
                            {g.samples.map((s) => (
                              <li key={s.id} className="truncate max-w-[18rem]" title={s.product_name ?? s.sku}>
                                · {s.product_name ?? <span className="font-mono">{s.sku}</span>}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums align-top">{g.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type KrogerRun = Awaited<ReturnType<typeof listKrogerRuns>>[number];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    toast.message("No SKUs were found in this run's window.");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RunSkuExportCard() {
  const [runs, setRuns] = useState<KrogerRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingRuns(true);
      try {
        const r = await listKrogerRuns({ data: { limit: 25 } });
        setRuns(r);
        if (r.length > 0) setSelectedRunId(r[0].id);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load Kroger runs");
      } finally {
        setLoadingRuns(false);
      }
    })();
  }, []);

  const selected = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const onExport = async () => {
    if (!selectedRunId) return;
    setExporting(true);
    try {
      const result = await listKrogerRunSkus({ data: { run_id: selectedRunId } });
      const stamp = new Date(result.run.started_at ?? result.window.from)
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");
      const flatRows = result.skus.map((s) => {
        const sx = s as any;
        return {
          sku: s.sku,
          upc: sx.upc ?? "",
          product_id: sx.product_id ?? "",
          product_name: s.product_name ?? "",
          regular_price: sx.regular_price ?? "",
          promo_price: sx.promo_price ?? "",
          price_unit_size: sx.price_unit_size ?? "",
          price_observed_at: sx.price_observed_at ?? "",
          status: s.status,
          match_confidence: s.match_confidence ?? "",
          reference_id: s.reference_id ?? "",
          reference_name: s.reference_name ?? "",
          last_seen_at: s.last_seen_at,
          confirmed_at: s.confirmed_at ?? "",
          notes: s.notes ?? "",
          run_id: result.run.id,
          run_started_at: result.run.started_at ?? "",
          run_finished_at: result.run.finished_at ?? "",
          run_status: result.run.status ?? "",
          run_location_id: result.run.location_id ?? "",
        };
      });
      downloadCsv(`kroger-run-skus-${stamp}.csv`, flatRows);
      if (flatRows.length > 0) {
        toast.success(`Exported ${flatRows.length} SKU${flatRows.length === 1 ? "" : "s"} from run.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export downloaded SKUs
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pick a Kroger ingest run and download a CSV of every SKU that was observed during that run's window.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Run</label>
            <Select
              value={selectedRunId}
              onValueChange={setSelectedRunId}
              disabled={loadingRuns || runs.length === 0}
            >
              <SelectTrigger className="h-9 w-[22rem]">
                <SelectValue placeholder={loadingRuns ? "Loading runs…" : "Select a run"} />
              </SelectTrigger>
              <SelectContent>
                {runs.map((r) => {
                  const when = new Date(r.started_at ?? r.created_at).toLocaleString();
                  const label = `${when} · ${r.status} · ${r.items_queried ?? 0} queried · ${r.sku_map_rows_touched ?? 0} SKUs touched`;
                  return (
                    <SelectItem key={r.id} value={r.id}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={onExport}
            disabled={!selectedRunId || exporting}
            className="gap-1.5 h-9"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export CSV
          </Button>
          {selected && (
            <div className="text-xs text-muted-foreground ml-auto">
              Window:{" "}
              {new Date(selected.started_at ?? selected.created_at).toLocaleString()} →{" "}
              {selected.finished_at ? new Date(selected.finished_at).toLocaleString() : "now"}
            </div>
          )}
        </div>
        {!loadingRuns && runs.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            No Kroger ingest runs yet. Trigger one from <span className="font-medium">Admin → Kroger Runs</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
