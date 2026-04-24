import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlayCircle, RefreshCw, Activity, AlertTriangle, CheckCircle2, Clock, Info, ListChecks, LineChart as LineChartIcon, Rocket, Filter } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "sonner";
import {
  ingestKrogerPrices,
  listKrogerRuns,
  getKrogerRun,
  getKrogerStatus,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-runs")({
  head: () => ({ meta: [{ title: "Kroger Ingest Runs — Admin" }] }),
  component: KrogerRunsPage,
});

type Run = Awaited<ReturnType<typeof listKrogerRuns>>[number];
type Status = Awaited<ReturnType<typeof getKrogerStatus>>;

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  queued: { label: "Queued", variant: "outline", icon: Clock },
  running: { label: "Running", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: AlertTriangle },
  skipped: { label: "Skipped", variant: "outline", icon: Info },
};

function KrogerRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [customLimit, setCustomLimit] = useState<string>("");
  const pollRef = useRef<number | null>(null);
  const [filterErrors, setFilterErrors] = useState(false);
  const [filterPriceRows, setFilterPriceRows] = useState(false);
  const [filterZeroSkus, setFilterZeroSkus] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        listKrogerRuns({ data: { limit: 25 } }),
        getKrogerStatus(),
      ]);
      setRuns(r);
      setStatus(s);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Poll while a run is queued/running
  useEffect(() => {
    const inFlight = runs.some((r) => r.status === "queued" || r.status === "running");
    if (!inFlight) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const [r, s] = await Promise.all([
          listKrogerRuns({ data: { limit: 25 } }),
          getKrogerStatus(),
        ]);
        setRuns(r);
        setStatus(s);
      } catch {}
    }, 2500);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [runs]);

  const triggerIngest = async (limit: number) => {
    setRunning(true);
    try {
      const res = await ingestKrogerPrices({ data: { limit } });
      if (res.ran) {
        toast.success(res.message + (limit === 0 ? " (all items)" : ` (limit ${limit})`));
        setActiveRunId(res.run_id ?? null);
      } else {
        toast.message(res.message);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Ingest failed");
    } finally {
      setRunning(false);
    }
  };

  const onRunDefault = () => triggerIngest(25);
  const onRunAll = () => triggerIngest(0);
  const onRunCustom = () => {
    const n = parseInt(customLimit, 10);
    if (!Number.isFinite(n) || n < 1) { toast.error("Enter a number ≥ 1"); return; }
    triggerIngest(n);
  };

  const latest = runs[0] ?? null;
  const latestErrors = (latest?.errors as Array<{ item: string; error: string }> | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Kroger Ingest Runs</h1>
          <p className="text-sm text-muted-foreground">
            Trigger and monitor background Kroger price ingest runs. Refresh anytime — runs continue server-side.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Link to="/admin/kroger-sku-review"><Button size="sm" variant="outline" className="gap-1"><ListChecks className="w-3.5 h-3.5" />SKUs ({status?.mapped_skus ?? 0}+{status?.unmapped_skus ?? 0})</Button></Link>
          <Link to="/admin/kroger-pricing"><Button size="sm" variant="outline" className="gap-1"><LineChartIcon className="w-3.5 h-3.5" />Price history ({status?.price_history_rows ?? 0})</Button></Link>
          <Button size="sm" variant="outline" onClick={onRunDefault} disabled={running || !status?.enabled || !status?.keys_configured} className="gap-1">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Run 25
          </Button>
          <div className="flex items-center gap-1">
            <Input
              value={customLimit}
              onChange={(e) => setCustomLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="N"
              className="h-8 w-16 text-sm"
              disabled={running || !status?.enabled || !status?.keys_configured}
            />
            <Button size="sm" variant="outline" onClick={onRunCustom} disabled={running || !status?.enabled || !status?.keys_configured || !customLimit}>Run N</Button>
          </div>
          <Button size="sm" onClick={onRunAll} disabled={running || !status?.enabled || !status?.keys_configured} className="gap-1">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            Run all items
          </Button>
        </div>
      </div>

      {status && (!status.enabled || !status.keys_configured) && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>Ingest unavailable</AlertTitle>
          <AlertDescription>
            {!status.keys_configured && <>Missing API keys: {status.missing_keys.join(", ")}. </>}
            {!status.enabled && <>Ingest is disabled — enable it in Kroger Pricing settings.</>}
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4" /> Last run
            </CardTitle>
            {latest && (
              <div className="flex items-center gap-2">
                <RunStatusBadge status={latest.status} />
                <span className="text-xs text-muted-foreground">{new Date(latest.created_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run 25" or "Run all items" to start one.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {latest.location_id && (
                  <Badge variant="outline" className="text-xs">loc: {latest.location_id}</Badge>
                )}
                {latest.item_limit != null && (
                  <Badge variant="outline" className="text-xs">limit: {latest.item_limit === 0 ? "all" : latest.item_limit}</Badge>
                )}
                {latest.started_at && latest.finished_at && (
                  <Badge variant="outline" className="text-xs">
                    duration: {Math.max(0, Math.round((new Date(latest.finished_at).getTime() - new Date(latest.started_at).getTime()) / 1000))}s
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="SKUs queried" value={latest.items_queried} icon={ListChecks} tone="neutral" />
                <StatCard label="Prices written" value={latest.price_rows_written} icon={LineChartIcon} tone="primary" />
                <StatCard label="SKUs mapped" value={latest.sku_map_rows_touched} icon={CheckCircle2} tone="success" />
                <StatCard label="Errors" value={latestErrors.length} icon={AlertTriangle} tone={latestErrors.length > 0 ? "destructive" : "neutral"} />
              </div>
              {latest.message && (
                <p className="text-sm text-muted-foreground italic">{latest.message}</p>
              )}
              {latestErrors.length > 0 ? (
                <div className="border rounded-md border-destructive/30">
                  <div className="px-3 py-2 border-b border-destructive/30 bg-destructive/5 text-xs font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-destructive"><AlertTriangle className="w-3.5 h-3.5" />All errors ({latestErrors.length})</span>
                  </div>
                  <div className="max-h-80 overflow-auto divide-y">
                    {latestErrors.map((e, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                        <span className="font-medium truncate" title={e.item}>{e.item}</span>
                        <span className="text-destructive break-words" title={e.error}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : latest.status === "completed" ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />No errors reported.</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Run history</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1"><Filter className="w-3 h-3" />Filter</span>
              <Toggle size="sm" pressed={filterErrors} onPressedChange={setFilterErrors} aria-label="Only runs with errors" className="h-7 px-2 text-xs gap-1 data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive">
                <AlertTriangle className="w-3 h-3" />Has errors
              </Toggle>
              <Toggle size="sm" pressed={filterPriceRows} onPressedChange={setFilterPriceRows} aria-label="Only runs that updated price rows" className="h-7 px-2 text-xs gap-1">
                <LineChartIcon className="w-3 h-3" />Updated prices
              </Toggle>
              <Toggle size="sm" pressed={filterZeroSkus} onPressedChange={setFilterZeroSkus} aria-label="Only runs with zero SKUs mapped" className="h-7 px-2 text-xs gap-1">
                <ListChecks className="w-3 h-3" />0 SKUs mapped
              </Toggle>
              {(filterErrors || filterPriceRows || filterZeroSkus) && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setFilterErrors(false); setFilterPriceRows(false); setFilterZeroSkus(false); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const filteredRuns = runs.filter((r) => {
              const errs = (r.errors as any[]) ?? [];
              if (filterErrors && errs.length === 0) return false;
              if (filterPriceRows && (r.price_rows_written ?? 0) === 0) return false;
              if (filterZeroSkus && (r.sku_map_rows_touched ?? 0) !== 0) return false;
              return true;
            });
            const anyFilter = filterErrors || filterPriceRows || filterZeroSkus;
            return loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : filteredRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              {anyFilter && (
                <p className="text-xs text-muted-foreground mb-2">Showing {filteredRuns.length} of {runs.length} runs</p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Queried</TableHead>
                    <TableHead className="text-right">Price rows</TableHead>
                    <TableHead className="text-right">SKUs</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRuns.map((r) => {
                    const errs = (r.errors as any[]) ?? [];
                    const dur = r.started_at && r.finished_at
                      ? `${Math.max(0, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000))}s`
                      : r.status === "running" ? "…" : "—";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                        <TableCell><RunStatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">{r.items_queried}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.price_rows_written}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sku_map_rows_touched}</TableCell>
                        <TableCell className="text-right tabular-nums">{errs.length}</TableCell>
                        <TableCell className="text-xs">{r.location_id ?? "—"}</TableCell>
                        <TableCell className="text-xs">{dur}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, variant: "outline" as const, icon: Info };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone: "neutral" | "primary" | "success" | "destructive";
}) {
  const toneClasses =
    tone === "destructive"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : tone === "success"
        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
        : tone === "primary"
          ? "border-primary/30 bg-primary/5 text-primary"
          : "border-border bg-muted/20 text-foreground";
  return (
    <div className={`rounded-md border p-3 ${toneClasses}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
