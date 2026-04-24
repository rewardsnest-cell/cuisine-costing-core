import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlayCircle, RefreshCw, Activity, AlertTriangle, CheckCircle2, Clock, Info, ListChecks, LineChart as LineChartIcon, Rocket } from "lucide-react";
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
  const pollRef = useRef<number | null>(null);

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
        const r = await listKrogerRuns({ data: { limit: 25 } });
        setRuns(r);
      } catch {}
    }, 2500);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [runs]);

  const onRun = async () => {
    setRunning(true);
    try {
      const res = await ingestKrogerPrices({ data: {} });
      if (res.ran) {
        toast.success(res.message);
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={onRun} disabled={running || !status?.enabled || !status?.keys_configured} className="gap-1">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Run ingest
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" /> Latest run summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run ingest" to start one.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <RunStatusBadge status={latest.status} />
                <span className="text-sm text-muted-foreground">
                  {new Date(latest.created_at).toLocaleString()}
                </span>
                {latest.location_id && (
                  <Badge variant="outline" className="text-xs">loc: {latest.location_id}</Badge>
                )}
                {latest.item_limit && (
                  <Badge variant="outline" className="text-xs">limit: {latest.item_limit}</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Stat label="Items queried" value={latest.items_queried} />
                <Stat label="Price rows" value={latest.price_rows_written} />
                <Stat label="SKU map rows" value={latest.sku_map_rows_touched} />
                <Stat label="Errors" value={latestErrors.length} />
              </div>
              {latest.message && (
                <p className="text-sm text-muted-foreground italic">{latest.message}</p>
              )}
              {latestErrors.length > 0 && (
                <div className="border rounded-md">
                  <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium">Recent errors ({latestErrors.length})</div>
                  <div className="max-h-64 overflow-auto divide-y">
                    {latestErrors.slice(0, 50).map((e, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs flex gap-3">
                        <span className="font-medium min-w-0 truncate">{e.item}</span>
                        <span className="text-destructive flex-1 min-w-0 truncate">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
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
                  {runs.map((r) => {
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
          )}
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
