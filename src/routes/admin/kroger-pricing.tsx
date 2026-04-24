import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, ShieldAlert, Activity, KeyRound, PlayCircle, RefreshCw, AlertTriangle,
  CheckCircle2, Clock, Info, ListChecks, LineChart as LineChartIcon, Rocket, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  getKrogerStatus,
  setKrogerEnabled,
  listKrogerRuns,
  runKrogerIngest,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-pricing")({
  head: () => ({ meta: [{ title: "Kroger Pricing — Admin" }] }),
  component: KrogerPricingPage,
});

type Status = Awaited<ReturnType<typeof getKrogerStatus>>;
type Run = Awaited<ReturnType<typeof listKrogerRuns>>[number];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  queued: { label: "Queued", variant: "outline", icon: Clock },
  running: { label: "Running", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: AlertTriangle },
  skipped: { label: "Skipped", variant: "outline", icon: Info },
};

function KrogerPricingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmBootstrap, setConfirmBootstrap] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        getKrogerStatus(),
        listKrogerRuns({ data: { limit: 25 } }),
      ]);
      setStatus(s);
      setRuns(r);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load Kroger status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Poll while a run is in-flight
  useEffect(() => {
    const inFlight = runs.some((r) => r.status === "queued" || r.status === "running");
    if (!inFlight) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const [s, r] = await Promise.all([
          getKrogerStatus(),
          listKrogerRuns({ data: { limit: 25 } }),
        ]);
        setStatus(s);
        setRuns(r);
      } catch {}
    }, 3000);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [runs]);

  const onToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await setKrogerEnabled({ data: { enabled } });
      toast.success(enabled ? "Kroger ingest enabled" : "Kroger ingest disabled");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update flag");
    } finally {
      setToggling(false);
    }
  };

  const triggerRun = async (mode: "daily_update" | "catalog_bootstrap") => {
    setRunning(true);
    try {
      const res = await runKrogerIngest({ data: { mode } });
      if (res.ran) {
        toast.success(res.message);
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

  const onRunDaily = () => triggerRun("daily_update");
  const onRunBootstrap = () => {
    setConfirmBootstrap(false);
    triggerRun("catalog_bootstrap");
  };

  // Automation status: derive from runs whose message includes "mode=" or skipped cron rows
  const lastSuccess = runs.find((r) => r.status === "completed");
  const lastRun = runs[0] ?? null;
  const cronRuns = runs.filter((r) => (r.message ?? "").toLowerCase().includes("cron"));
  const cronEnabled = cronRuns.length > 0 || (lastSuccess != null && status?.enabled);

  const ingestUnavailable = status && (!status.enabled || !status.keys_configured);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Kroger Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Operational control for the Kroger ingestion pipeline. Daily updates run automatically; ZIP → locationId is resolved server-side.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/kroger-sku-review"><Button size="sm" variant="outline" className="gap-1"><ListChecks className="w-3.5 h-3.5" />SKU Mapping</Button></Link>
          <Link to="/admin/kroger-price-signals"><Button size="sm" variant="outline" className="gap-1"><LineChartIcon className="w-3.5 h-3.5" />Price Signals</Button></Link>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="w-4 h-4" />
        <AlertTitle>Pricing intelligence, not cost truth</AlertTitle>
        <AlertDescription>
          Kroger prices land in <code>price_history</code> (source <code>kroger_api</code>) for benchmarking only. They never modify
          inventory, recipe, or quote pricing. Disabling the flag stops all ingestion immediately.
        </AlertDescription>
      </Alert>

      {/* === 1. RUN CONTROLS === */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PlayCircle className="w-4 h-4" /> Run Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !status ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={status.enabled} disabled={toggling} onCheckedChange={onToggle} />
                  <span className="text-sm font-medium">{status.enabled ? "Ingest enabled" : "Ingest disabled"}</span>
                </div>
                {status.keys_configured ? (
                  <Badge variant="secondary" className="gap-1"><KeyRound className="w-3 h-3" />API keys configured</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" />Missing: {status.missing_keys.join(", ")}</Badge>
                )}
              </div>

              {ingestUnavailable && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    {!status.keys_configured && <>Missing API keys: {status.missing_keys.join(", ")}. </>}
                    {!status.enabled && <>Ingest is disabled — toggle it on above to run.</>}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="default"
                  onClick={onRunDaily}
                  disabled={running || !status.enabled || !status.keys_configured}
                  className="gap-2"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  Run Daily Update
                </Button>
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => setConfirmBootstrap(true)}
                  disabled={running || !status.enabled || !status.keys_configured}
                  className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Rocket className="w-4 h-4" />
                  Run Full Catalog Import
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Daily Update</strong> refreshes confirmed SKUs (~100 items). <strong>Catalog Bootstrap</strong> walks the
                full inventory (~500+ items) and is long-running — only use when seeding or after large catalog changes.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* === 2. AUTOMATION STATUS === */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" /> Automation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4">
              <StatusTile
                label="Daily cron"
                value={cronEnabled ? "Enabled" : "Inactive"}
                tone={cronEnabled ? "success" : "muted"}
                detail={cronRuns.length > 0 ? `${cronRuns.length} cron-triggered run(s) recorded` : "No cron-triggered runs detected yet"}
              />
              <StatusTile
                label="Last successful run"
                value={lastSuccess ? formatRelative(lastSuccess.finished_at ?? lastSuccess.created_at) : "Never"}
                tone={lastSuccess ? "success" : "muted"}
                detail={lastSuccess ? new Date(lastSuccess.finished_at ?? lastSuccess.created_at).toLocaleString() : "Run a daily update to start"}
              />
              <StatusTile
                label="Last run"
                value={lastRun ? (STATUS_BADGE[lastRun.status]?.label ?? lastRun.status) : "—"}
                tone={!lastRun ? "muted" : lastRun.status === "completed" ? "success" : lastRun.status === "failed" ? "destructive" : "neutral"}
                detail={lastRun ? `mode: ${parseMode(lastRun.message)} · ${new Date(lastRun.created_at).toLocaleString()}` : "—"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* === 3. RECENT RUNS === */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" /> Recent Runs
          </CardTitle>
          <p className="text-xs text-muted-foreground">Source of truth: <code>kroger_ingest_runs</code></p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run Daily Update" above to start one.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">SKUs queried</TableHead>
                    <TableHead className="text-right">Prices written</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => {
                    const errs = (r.errors as any[] | null) ?? [];
                    const sb = STATUS_BADGE[r.status] ?? STATUS_BADGE.queued;
                    const Icon = sb.icon;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(r.started_at ?? r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{parseMode(r.message)}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={sb.variant} className="gap-1">
                            <Icon className={`w-3 h-3 ${r.status === "running" ? "animate-spin" : ""}`} />
                            {sb.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.items_queried}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.price_rows_written}</TableCell>
                        <TableCell className="max-w-md">
                          {errs.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className="text-xs text-destructive">
                              {errs.length} error{errs.length === 1 ? "" : "s"}
                              {errs[0]?.error && <span className="text-muted-foreground"> · {String(errs[0].error).slice(0, 80)}</span>}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmBootstrap} onOpenChange={setConfirmBootstrap}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run full catalog import?</AlertDialogTitle>
            <AlertDialogDescription>
              This walks the entire inventory catalog against Kroger. It is long-running, costs many API calls,
              and should only be used when seeding or after large inventory changes. The run continues server-side
              if you close this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRunBootstrap} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Run catalog import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusTile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: "success" | "destructive" | "neutral" | "muted" }) {
  const toneClass =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "destructive" ? "text-destructive" :
    tone === "muted" ? "text-muted-foreground" :
    "text-foreground";
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      {detail && <div className="text-xs text-muted-foreground truncate" title={detail}>{detail}</div>}
    </div>
  );
}

function parseMode(message: string | null): string {
  if (!message) return "manual";
  const m = message.match(/mode=(\w+)/);
  if (m) return m[1];
  if (message.toLowerCase().includes("test")) return "test";
  if (message.toLowerCase().includes("cron")) return "cron";
  return "manual";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
