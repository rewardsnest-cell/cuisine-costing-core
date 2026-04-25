import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Play, FlaskConical, RefreshCw, Search, CheckCircle2, AlertTriangle, XCircle, Download, TestTube2,
} from "lucide-react";
import {
  runCatalogStage,
  getCatalogSummary,
  listCatalogRuns,
  traceCatalogEntity,
  resolveCatalogErrors,
  runCatalogTestHarness,
} from "@/lib/server-fns/pricing-v2-catalog.functions";
import { listPricingV2Errors } from "@/lib/server-fns/pricing-v2.functions";

export const Route = createFileRoute("/admin/pricing-v2/catalog")({
  head: () => ({ meta: [{ title: "Pricing v2 — Catalog (Stage 0)" }] }),
  component: PricingV2CatalogPage,
});

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function statusVariant(s?: string | null) {
  switch (s) {
    case "success": return "default" as const;
    case "running":
    case "queued": return "secondary" as const;
    case "partial": return "outline" as const;
    case "failed": return "destructive" as const;
    default: return "outline" as const;
  }
}

function PricingV2CatalogPage() {
  const [month, setMonth] = useState(currentMonth());
  const [limit, setLimit] = useState<string>("");
  const [filter, setFilter] = useState<string>("");
  const [traceId, setTraceId] = useState<string>("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ["pricing-v2", "catalog", "summary"],
    queryFn: () => getCatalogSummary(),
  });
  const runs = useQuery({
    queryKey: ["pricing-v2", "catalog", "runs"],
    queryFn: () => listCatalogRuns(),
  });
  const errors = useQuery({
    queryKey: ["pricing-v2", "catalog", "errors", activeRunId],
    queryFn: () => listPricingV2Errors({ data: { stage: "catalog", limit: 200 } }),
  });

  const runMut = useMutation({
    mutationFn: (params: { dry_run: boolean }) =>
      runCatalogStage({
        data: {
          dry_run: params.dry_run,
          month,
          limit: limit ? Number(limit) : undefined,
          filter: filter || undefined,
        },
      }),
    onSuccess: (res) => {
      setActiveRunId(res.run_id);
      summary.refetch();
      runs.refetch();
      errors.refetch();
    },
  });

  const trace = useQuery({
    queryKey: ["pricing-v2", "catalog", "trace", traceId],
    queryFn: () => traceCatalogEntity({ data: { entity_id: traceId } }),
    enabled: !!traceId && /^[0-9a-f-]{36}$/.test(traceId),
  });

  const resolveMut = useMutation({
    mutationFn: (entity_id: string) => resolveCatalogErrors({ data: { entity_id } }),
    onSuccess: () => errors.refetch(),
  });

  const testMut = useMutation({
    mutationFn: () => runCatalogTestHarness({ data: undefined as any }),
    onSuccess: () => { errors.refetch(); runs.refetch(); },
  });

  const exportCsv = () => {
    const rows = errors.data?.errors ?? [];
    const cols = ["created_at", "severity", "type", "entity_id", "entity_name", "message", "suggested_fix"];
    const lines = [cols.join(",")];
    for (const r of rows) lines.push(cols.map((c) => JSON.stringify((r as any)[c] ?? "")).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "catalog-errors.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const t = summary.data?.tiles;
  const lastRunData = runMut.data;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Pricing v2 — Stage 0: Catalog (bootstrap)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Validates that every inventory item has a Kroger product mapping,
            a positive pack weight in grams, and a unit. Required before any
            other pricing stage can run.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total inventory items" value={t?.total} />
        <Tile label="With Kroger mapping" value={t?.mapped} hint={t ? `${pct(t.mapped, t.total)}%` : ""} />
        <Tile label="With pack weight" value={t?.weighted} hint={t ? `${pct(t.weighted, t.total)}%` : ""} />
        <Tile label="Catalog ready" value={t?.ready} hint={t ? `${pct(t.ready, t.total)}%` : ""} />
      </div>

      {/* Run controls */}
      <Card>
        <CardHeader><CardTitle className="text-base">Run controls</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Month</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Limit (subset)</Label>
              <Input type="number" placeholder="e.g. 25" value={limit}
                     onChange={(e) => setLimit(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Filter (name contains)</Label>
              <Input placeholder="e.g. butter" value={filter}
                     onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runMut.mutate({ dry_run: true })} disabled={runMut.isPending} className="gap-2">
              <FlaskConical className="w-4 h-4" /> Dry Run
            </Button>
            <Button onClick={() => runMut.mutate({ dry_run: false })} disabled={runMut.isPending} variant="default" className="gap-2">
              <Play className="w-4 h-4" /> Run
            </Button>
            <Button onClick={() => runMut.mutate({ dry_run: false })} disabled={runMut.isPending || !(limit || filter)} variant="outline" className="gap-2">
              <Search className="w-4 h-4" /> Run Subset
            </Button>
          </div>
          {runMut.isError && (
            <p className="text-sm text-destructive">{(runMut.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {/* Last run result */}
      {lastRunData && (
        <Card className="border-primary/30">
          <CardHeader><CardTitle className="text-base">Last run result</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <Stat label="run_id" value={<code className="text-[10px] break-all">{lastRunData.run_id}</code>} />
              <Stat label="status" value={<Badge variant={statusVariant(lastRunData.status)}>{lastRunData.status}</Badge>} />
              <Stat label="dry_run" value={lastRunData.dry_run ? "yes" : "no"} />
              <Stat label="in → out" value={`${lastRunData.counts_in} → ${lastRunData.counts_out}`} />
              <Stat label="warnings" value={String(lastRunData.warnings)} />
              <Stat label="errors" value={String(lastRunData.errors)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Harness */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TestTube2 className="w-4 h-4" /> Test Harness
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Runs 6 deterministic test cases (3 PASS, 3 FAIL) against the catalog validator.
              FAIL cases write real entries to <code>pricing_v2_errors</code> with stage <code>catalog</code>.
            </p>
          </div>
          <Button onClick={() => testMut.mutate()} disabled={testMut.isPending} className="gap-2">
            <TestTube2 className="w-4 h-4" />
            {testMut.isPending ? "Running…" : "Run Test Cases"}
          </Button>
        </CardHeader>
        {testMut.data && (
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={testMut.data.overall_pass ? "default" : "destructive"}>
                {testMut.data.overall_pass ? "ALL PASS" : "FAILURES"}
              </Badge>
              <span>{testMut.data.summary.passed}/{testMut.data.summary.total} passed</span>
              <span className="text-muted-foreground">·</span>
              <span>{testMut.data.summary.errors_logged} errors logged</span>
              <span className="text-muted-foreground">·</span>
              <code className="text-[10px]">{testMut.data.run_id}</code>
              <Link to="/admin/pricing-v2/errors" search={{ stage: "catalog" } as any}>
                <Button size="sm" variant="ghost">View errors →</Button>
              </Link>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Result</TableHead>
                  <TableHead className="w-20">Expect</TableHead>
                  <TableHead>Test case</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Issues produced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testMut.data.results.map((r: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {r.passed
                        ? <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />PASS</Badge>
                        : <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />FAIL</Badge>}
                    </TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">{r.expect}</TableCell>
                    <TableCell className="text-xs font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.details}</TableCell>
                    <TableCell className="text-xs">
                      {r.actualIssues.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {r.actualIssues.map((i: any, j: number) => (
                            <li key={j} className="flex items-center gap-1.5">
                              <SeverityBadge s={i.severity} />
                              <code>{i.type}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
        {testMut.isError && (
          <CardContent>
            <p className="text-sm text-destructive">{(testMut.error as Error).message}</p>
          </CardContent>
        )}
      </Card>

      {/* Recent runs */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In → Out</TableHead>
                <TableHead>Warn / Err</TableHead>
                <TableHead>Params</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs.data?.runs ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{fmt(r.started_at)}</TableCell>
                  <TableCell><Badge variant={statusVariant(r.status)}>{r.status}</Badge></TableCell>
                  <TableCell>{r.counts_in} → {r.counts_out}</TableCell>
                  <TableCell>{r.warnings_count} / {r.errors_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.params?.dry_run ? "dry · " : ""}{r.params?.filter ? `"${r.params.filter}"` : ""}
                    {r.params?.limit ? ` lim ${r.params.limit}` : ""}
                  </TableCell>
                </TableRow>
              ))}
              {(runs.data?.runs ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No runs yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Errors table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Catalog errors</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => errors.refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button>
            <Link to="/admin/pricing-v2/errors"><Button size="sm" variant="ghost">View all →</Button></Link>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(errors.data?.errors ?? []).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmt(e.created_at)}</TableCell>
                  <TableCell><SeverityBadge s={e.severity} /></TableCell>
                  <TableCell className="text-xs"><code>{e.type}</code></TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{e.entity_name ?? "—"}</div>
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => setTraceId(e.entity_id)}
                    >{e.entity_id}</button>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{e.message}</div>
                    {e.suggested_fix && (
                      <div className="text-muted-foreground mt-0.5">Fix: {e.suggested_fix}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() =>
                        runCatalogStage({ data: { dry_run: false, entity_id: e.entity_id } })
                          .then(() => { errors.refetch(); summary.refetch(); })
                      }>Retry</Button>
                      <Button size="sm" variant="ghost" disabled={!!e.resolved_at}
                              onClick={() => resolveMut.mutate(e.entity_id)}>
                        {e.resolved_at ? "Resolved" : "Resolve"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(errors.data?.errors ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No errors logged</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trace preview */}
      <Card>
        <CardHeader><CardTitle className="text-base">Trace preview</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Inventory item UUID" value={traceId}
                   onChange={(e) => setTraceId(e.target.value.trim())} />
            <Button variant="outline" onClick={() => trace.refetch()} disabled={!traceId}>Trace</Button>
          </div>
          {trace.data?.item ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Inputs</div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{JSON.stringify(trace.data.item, null, 2)}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Computed</div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{JSON.stringify(trace.data.computed, null, 2)}
                </pre>
                <div className="text-xs uppercase text-muted-foreground mt-2">Issues</div>
                {trace.data.issues.length === 0
                  ? <div className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> No issues — ready</div>
                  : (
                    <ul className="text-xs space-y-1">
                      {trace.data.issues.map((i: any, idx: number) => (
                        <li key={idx} className="flex gap-2">
                          <SeverityBadge s={i.severity} />
                          <span>{i.message} <span className="text-muted-foreground">({i.suggested_fix})</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          ) : (
            traceId && trace.isFetched && <p className="text-sm text-muted-foreground">No item found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function pct(part?: number, total?: number) {
  if (!total || !part) return 0;
  return Math.round((part / total) * 100);
}

function Tile({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 font-display text-2xl font-bold text-foreground">{value ?? "—"}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function SeverityBadge({ s }: { s?: string }) {
  if (s === "error" || s === "critical")
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{s}</Badge>;
  if (s === "warning")
    return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700"><AlertTriangle className="w-3 h-3" />{s}</Badge>;
  return <Badge variant="secondary">{s ?? "info"}</Badge>;
}
