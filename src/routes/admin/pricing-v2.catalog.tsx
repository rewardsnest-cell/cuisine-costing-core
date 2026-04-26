// Pricing v2 — Stage 0: Catalog Bootstrap + Weight Parsing.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { CheckCircle2, AlertTriangle, Loader2, Play, RotateCcw, ShieldCheck, Wrench, Bug, ShieldAlert, Repeat } from "lucide-react";
import { toast } from "sonner";
import { BootstrapLiveProgress } from "@/components/admin/BootstrapLiveProgress";
import { BootstrapRunDetailsDialog } from "@/components/admin/BootstrapRunDetailsDialog";
import { getPricingV2Settings } from "@/lib/server-fns/pricing-v2.functions";
import {
  runCatalogBootstrap,
  listCatalogRunErrors,
  listCatalogRuns,
  setManualWeight,
  reparseCatalogItem,
  traceCatalogProduct,
  runCatalogTestHarness,
  listCatalogTestErrors,
  getCatalogBootstrapState,
  resetCatalogBootstrap,
  recoverStuckCatalogRuns,
  getBootstrapPreflight,
  replayCatalogRun,
  listActiveStuckAlerts,
  acknowledgeStuckAlert,
  getAlertConfig,
  saveAlertConfig,
  testAlertConfig,
  listCatalogProducts,
} from "@/lib/server-fns/pricing-v2-catalog.functions";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/pricing-v2/catalog")({
  head: () => ({ meta: [{ title: "Pricing v2 — Stage 0 Catalog Bootstrap" }] }),
  component: CatalogBootstrapPage,
});

type RunResult = Awaited<ReturnType<typeof runCatalogBootstrap>>;
type TestResult = Awaited<ReturnType<typeof runCatalogTestHarness>>;

function CatalogBootstrapPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["pricing-v2", "settings"],
    queryFn: () => getPricingV2Settings(),
  });
  const runs = useQuery({
    queryKey: ["pricing-v2", "catalog", "runs"],
    queryFn: () => listCatalogRuns(),
  });
  const bootstrapState = useQuery({
    queryKey: ["pricing-v2", "catalog", "bootstrap-state"],
    queryFn: () => getCatalogBootstrapState(),
    refetchInterval: (q: any) => (q.state?.data?.state?.status === "IN_PROGRESS" ? 4000 : false),
  });
  const preflight = useQuery({
    queryKey: ["pricing-v2", "catalog", "preflight"],
    queryFn: () => getBootstrapPreflight(),
    refetchInterval: 15_000,
  });
  const activeAlerts = useQuery({
    queryKey: ["pricing-v2", "catalog", "stuck-alerts"],
    queryFn: () => listActiveStuckAlerts(),
    refetchInterval: 15_000,
  });
  const alertConfig = useQuery({
    queryKey: ["pricing-v2", "catalog", "alert-config"],
    queryFn: () => getAlertConfig(),
  });
  const ackAlertMut = useMutation({
    mutationFn: (id: string) => acknowledgeStuckAlert({ data: { id } }),
    onSuccess: () => {
      toast.success("Alert acknowledged");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog", "stuck-alerts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Acknowledge failed"),
  });
  const saveAlertCfgMut = useMutation({
    mutationFn: (cfg: any) => saveAlertConfig({ data: cfg }),
    onSuccess: () => {
      toast.success("Alert config saved");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog", "alert-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });
  const testAlertMut = useMutation({
    mutationFn: () => testAlertConfig(),
    onSuccess: (r: any) => {
      toast.success(`Test alert dispatched (${r?.fired ?? 0} event${r?.fired === 1 ? "" : "s"})`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog", "stuck-alerts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Test alert failed"),
  });

  const [batchSize, setBatchSize] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  // Default ON in staging — matches the server-side default and keeps the
  // download fast/forgiving while we're still mapping inventory items.
  const [skipWeight, setSkipWeight] = useState<boolean>(true);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string>("");
  const [detailsRunId, setDetailsRunId] = useState<string | null>(null);

  // Guarded "Run Bootstrap" flow: dry-run first, then confirm full run.
  const [guardedPhase, setGuardedPhase] = useState<"idle" | "dry-running" | "awaiting-confirm" | "full-running">("idle");
  const [guardedDryResult, setGuardedDryResult] = useState<RunResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runGuarded = async () => {
    try {
      setGuardedPhase("dry-running");
      setGuardedDryResult(null);
      const dry = await runCatalogBootstrap({
        data: { dry_run: true, batch_size: batchNum ?? 50, keyword: keyword || undefined, skip_weight_normalization: skipWeight },
      }) as RunResult;
      setLastResult(dry);
      setGuardedDryResult(dry);
      if (dry.run_id) setErrFilterRun(dry.run_id);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });

      if ((dry.errors_count ?? 0) > 0) {
        toast.error(`Dry run found ${dry.errors_count} errors — review before running full bootstrap`);
        setGuardedPhase("awaiting-confirm");
        setConfirmOpen(true);
        return;
      }
      toast.success(`Dry run OK — in:${dry.counts_in} out:${dry.counts_out} warn:${dry.warnings_count}`);
      setGuardedPhase("awaiting-confirm");
      setConfirmOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Dry run failed");
      setGuardedPhase("idle");
    }
  };

  const confirmFullRun = async () => {
    setConfirmOpen(false);
    try {
      setGuardedPhase("full-running");
      const res = await runCatalogBootstrap({
        data: { dry_run: false, batch_size: batchNum, keyword: keyword || undefined, skip_weight_normalization: skipWeight },
      }) as RunResult;
      setLastResult(res);
      if (res.run_id) setErrFilterRun(res.run_id);
      if (res.skipped) toast.info(res.message ?? "Bootstrap already completed");
      else if (res.bootstrap_completed) toast.success(`Bootstrap COMPLETED — fetched ${res.counts_out} this batch`);
      else toast.success(`Batch done — in:${res.counts_in} out:${res.counts_out} warn:${res.warnings_count} err:${res.errors_count}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setGuardedPhase("idle");
      setGuardedDryResult(null);
    }
  };

  const [errFilterRun, setErrFilterRun] = useState<string>("");
  const [errFilterSeverity, setErrFilterSeverity] = useState<"" | "warning" | "error">("");
  const errors = useQuery({
    queryKey: ["pricing-v2", "catalog", "errors", errFilterRun, errFilterSeverity],
    queryFn: () =>
      listCatalogRunErrors({
        data: {
          run_id: errFilterRun || undefined,
          severity: errFilterSeverity || undefined,
          limit: 200,
        },
      }),
  });

  const runMut = useMutation({
    mutationFn: (vars: { dry_run: boolean; batch_size?: number; keyword?: string; skip_weight_normalization?: boolean }) =>
      runCatalogBootstrap({ data: vars }),
    onSuccess: (res: any) => {
      setLastResult(res);
      if (res.run_id) setErrFilterRun(res.run_id);
      if (res.blocked_by_preflight) toast.error(res.message ?? "Bootstrap blocked by preflight");
      else if (res.skipped) toast.info(res.message ?? "Bootstrap already completed");
      else if (res.bootstrap_completed) toast.success(`Bootstrap COMPLETED — fetched ${res.counts_out} this batch`);
      else toast.success(`Batch done — in:${res.counts_in} out:${res.counts_out} warn:${res.warnings_count} err:${res.errors_count}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Run failed"),
  });

  const resetMut = useMutation({
    mutationFn: () => resetCatalogBootstrap({ data: { confirmation: "RESET CATALOG" } }),
    onSuccess: () => {
      setResetConfirm("");
      toast.success("Bootstrap reset to NOT_STARTED");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reset failed"),
  });

  const recoverMut = useMutation({
    mutationFn: () => recoverStuckCatalogRuns({ data: { older_than_minutes: 15 } }),
    onSuccess: (res: any) => {
      if (res.recovered === 0) toast.info("No stuck runs found (>15m old)");
      else toast.success(`Recovered ${res.recovered} stuck run${res.recovered === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "live-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Recovery failed"),
  });

  const replayMut = useMutation({
    mutationFn: (vars: { run_id: string; include_successful: boolean }) =>
      replayCatalogRun({ data: vars }),
    onSuccess: (res: any) => {
      setLastResult(res);
      if (res.run_id) setErrFilterRun(res.run_id);
      const tail =
        res.bootstrap_completed
          ? `bootstrap COMPLETED — fetched ${res.counts_out}`
          : `in:${res.counts_in} out:${res.counts_out} warn:${res.warnings_count} err:${res.errors_count}`;
      const mode = res.include_successful ? " (full)" : "";
      toast.success(`Replayed${mode} ${String(res.replay_of).slice(0, 8)}… → ${tail}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Replay failed"),
  });

  const testMut = useMutation({
    mutationFn: () => runCatalogTestHarness(),
    onSuccess: (res) => {
      setLastTestResult(res);
      setErrFilterRun(res.run_id);
      if (res.failed === 0) toast.success(`Test harness: ${res.passed}/${res.total} passed`);
      else toast.error(`Test harness: ${res.failed} of ${res.total} failed`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Test harness failed"),
  });

  const batchNum = batchSize ? Number(batchSize) : undefined;
  const bs = bootstrapState.data;
  const status = bs?.state?.status ?? "NOT_STARTED";
  const isCompleted = status === "COMPLETED";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Stage 0 — Kroger Catalog Bootstrap
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pulls Kroger products for the configured store, persists raw payloads, and parses
            net weight to grams. Uniform errors land in{" "}
            <Link to="/admin/pricing-v2/errors" className="underline">Pricing v2 Errors</Link>.
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <div>Store ID: <span className="font-mono">{settings.data?.settings?.kroger_store_id ?? "—"}</span></div>
          <div>ZIP: <span className="font-mono">{settings.data?.settings?.kroger_zip ?? "—"}</span></div>
        </div>
      </header>

      {/* Stuck-recovery alert banner */}
      {(activeAlerts.data?.alerts ?? []).length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {activeAlerts.data!.alerts.length} stuck-run alert{activeAlerts.data!.alerts.length === 1 ? "" : "s"} (auto-recovered)
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1 text-xs">
              {activeAlerts.data!.alerts.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-2 border-t border-destructive/30 pt-1">
                  <span className="truncate">
                    <span className="font-mono">{String(a.run_id ?? "").slice(0, 8)}…</span>
                    {" "}stuck ~{a.stuck_for_minutes}m (threshold {a.threshold_minutes}m) · {a.stage}
                  </span>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                    onClick={() => ackAlertMut.mutate(a.id)} disabled={ackAlertMut.isPending}>
                    Acknowledge
                  </Button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Alert config */}
      {alertConfig.data && (
        <Card>
          <CardHeader><CardTitle className="text-base">Stuck-run alert config</CardTitle></CardHeader>
          <CardContent>
            <AlertConfigForm
              initial={alertConfig.data}
              onSave={(v) => saveAlertCfgMut.mutate(v)}
              saving={saveAlertCfgMut.isPending}
              onTest={() => testAlertMut.mutate()}
              testing={testAlertMut.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Live progress panel — always visible, polls while a run is active */}
      <BootstrapLiveProgress guardedPhase={guardedPhase} />

      {/* Mapped-inventory preflight banner */}
      {preflight.data && !preflight.data.ok && (
        <Alert variant="destructive">
          <ShieldAlert className="w-4 h-4" />
          <AlertTitle>Bootstrap blocked — not enough mapped inventory</AlertTitle>
          <AlertDescription>
            <div className="mb-2">
              <span className="font-mono">{preflight.data.mapped_count}</span> inventory items are mapped to a Kroger product
              (minimum <span className="font-mono">{preflight.data.threshold}</span>).
            </div>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {preflight.data.guidance.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {preflight.data?.ok && (
        <div className="text-xs text-muted-foreground">
          Preflight OK — <span className="font-mono">{preflight.data.mapped_count}</span> mapped inventory items
          (≥ <span className="font-mono">{preflight.data.threshold}</span> required).
        </div>
      )}

      {/* Bootstrap Status panel */}

      <Card className={isCompleted ? "border-success/50" : status === "IN_PROGRESS" ? "border-amber-500/60" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isCompleted ? <CheckCircle2 className="w-4 h-4 text-success" /> :
              status === "IN_PROGRESS" ? <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> :
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />}
            Bootstrap Status
            <Badge variant={isCompleted ? "default" : status === "IN_PROGRESS" ? "secondary" : "outline"}>
              {status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Stat label="Total fetched" value={bs?.state?.total_items_fetched ?? 0} />
            <Stat label="Inventory IDs" value={`${bs?.inventory_ids_processed ?? 0} / ${bs?.inventory_ids_total ?? 0}`} />
            <Stat label="Remaining" value={bs?.inventory_ids_remaining ?? 0} />
            <Stat label="Started at" value={bs?.state?.started_at ? new Date(bs.state.started_at).toLocaleString() : "—"} />
            <Stat label="Completed at" value={bs?.state?.completed_at ? new Date(bs.state.completed_at).toLocaleString() : "—"} />
          </div>
          <div className="text-xs text-muted-foreground">
            Last run: <span className="font-mono">{bs?.state?.last_run_id ?? "—"}</span>
            {bs?.state?.last_page_token && <> · cursor: <span className="font-mono">{bs.state.last_page_token}</span></>}
          </div>

          {!isCompleted && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border">
              <div className="w-32">
                <Label htmlFor="batch">Batch size</Label>
                <Input id="batch" inputMode="numeric" placeholder="200" value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="flex-1 min-w-[180px]">
                <Label htmlFor="kw">Keyword sweep (optional, first batch only)</Label>
                <Input id="kw" placeholder="e.g. flour" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </div>
              <div className="basis-full" />
              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 max-w-xl">
                <Switch
                  id="skip-weight"
                  checked={skipWeight}
                  onCheckedChange={setSkipWeight}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="skip-weight" className="cursor-pointer font-medium">
                    Skip weight normalization
                    {skipWeight && <Badge variant="secondary" className="ml-2 text-[10px]">ON</Badge>}
                  </Label>
                  <p className="text-xs text-muted-foreground leading-snug">
                    When enabled, the bootstrap downloads raw Kroger product data and stores
                    <code className="mx-1 px-1 rounded bg-background">size_raw</code>
                    only — it does <strong>not</strong> attempt to parse net weight in grams,
                    and no <code className="px-1 rounded bg-background">WEIGHT_PARSE_FAIL</code> /
                    <code className="px-1 rounded bg-background">VOLUME_ONLY</code> errors are logged.
                    Weights can be filled in afterward via <em>Fix Weight</em> or a reparse.
                    Recommended for staging / first downloads.
                  </p>
                </div>
              </div>
              <div className="basis-full" />
              <Button
                onClick={runGuarded}
                disabled={
                  runMut.isPending ||
                  guardedPhase === "dry-running" ||
                  guardedPhase === "full-running" ||
                  (preflight.data && !preflight.data.ok)
                }
                title={preflight.data && !preflight.data.ok ? (preflight.data.reason ?? "Preflight blocked") : undefined}
                className="gap-1.5"
              >
                {guardedPhase === "dry-running" ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 guardedPhase === "full-running" ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 <ShieldCheck className="w-4 h-4" />}
                {guardedPhase === "dry-running" ? "Dry running…" :
                 guardedPhase === "full-running" ? (status === "IN_PROGRESS" ? "Resuming…" : "Running…") :
                 status === "IN_PROGRESS" ? "Resume Bootstrap (safe)" : "Run Bootstrap (safe)"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => runMut.mutate({ dry_run: false, batch_size: batchNum, keyword: keyword || undefined, skip_weight_normalization: skipWeight })}
                disabled={
                  runMut.isPending ||
                  guardedPhase !== "idle" ||
                  (preflight.data && !preflight.data.ok)
                }
                className="gap-1.5"
                title={preflight.data && !preflight.data.ok ? (preflight.data.reason ?? "Preflight blocked") : "Skip the dry-run preflight and run immediately"}
              >
                <Play className="w-4 h-4" />
                Run Now (skip dry-run)
              </Button>
              <Button
                variant="ghost"
                onClick={() => runMut.mutate({ dry_run: true, batch_size: 50, skip_weight_normalization: skipWeight })}
                disabled={runMut.isPending || guardedPhase !== "idle"}
              >
                Dry Run Only (50)
              </Button>
              <Button variant="ghost" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                Run Test Cases
              </Button>
            </div>
          )}

          {isCompleted && (
            <Alert>
              <CheckCircle2 className="w-4 h-4" />
              <AlertTitle>Catalog bootstrap completed</AlertTitle>
              <AlertDescription>
                All inventory-mapped Kroger products were downloaded once. Re-runs are blocked
                until you reset.
              </AlertDescription>
            </Alert>
          )}

          {/* Recover stuck runs */}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Recover stuck runs
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1 min-w-[260px]">
                Marks any catalog run stuck in <span className="font-mono">running</span> for
                more than 15 minutes as <span className="font-mono">failed</span> with a
                timestamp + error summary, and resets bootstrap_state if needed so you can resume.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => recoverMut.mutate()}
                disabled={recoverMut.isPending}
                className="gap-1.5"
              >
                {recoverMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                Recover Stuck Runs ({">"}15m)
              </Button>
            </div>
          </div>

          {/* Reset (dangerous) */}
          <div className="pt-3 border-t border-destructive/30 space-y-2">
            <div className="text-xs font-semibold text-destructive uppercase">Danger zone — Reset Bootstrap</div>
            <p className="text-xs text-muted-foreground">
              Sets status back to NOT_STARTED so the loop restarts from the first inventory id.
              Does NOT delete catalog or raw rows. Type <span className="font-mono">RESET CATALOG</span> to enable.
            </p>
            <div className="flex gap-2">
              <Input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="Type RESET CATALOG" className="max-w-xs" />
              <Button variant="destructive" disabled={resetConfirm !== "RESET CATALOG" || resetMut.isPending}
                onClick={() => resetMut.mutate()} className="gap-1.5">
                <RotateCcw className="w-4 h-4" /> Reset Bootstrap
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Last Run
              <Badge variant={lastResult.errors_count > 0 ? "destructive" : "default"}>
                {lastResult.errors_count > 0 ? "FAIL" : "PASS"}
              </Badge>
              {lastResult.dry_run && <Badge variant="outline">dry_run</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="run_id" value={<span className="font-mono text-xs break-all">{lastResult.run_id}</span>} />
              <Stat label="store_id" value={lastResult.store_id} />
              <Stat label="counts_in" value={lastResult.counts_in} />
              <Stat label="counts_out" value={lastResult.counts_out} />
              <Stat label="warnings / errors" value={`${lastResult.warnings_count} / ${lastResult.errors_count}`} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadJson(`pv2-catalog-${lastResult.run_id}.json`, lastResult)}>
                Download Run Summary JSON
              </Button>
              <Button size="sm" variant="outline" disabled={!lastResult.run_id} onClick={() => lastResult.run_id && exportErrorsCsv(lastResult.run_id)}>
                Download Error Report (CSV)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Harness Results */}
      {lastTestResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              Test Harness Results
              <Badge variant={lastTestResult.failed === 0 ? "default" : "destructive"}>
                {lastTestResult.failed === 0 ? "ALL PASS" : `${lastTestResult.failed} FAILED`}
              </Badge>
              <Badge variant="outline">stage: catalog_bootstrap_test</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="run_id" value={<span className="font-mono text-xs break-all">{lastTestResult.run_id}</span>} />
              <Stat label="total" value={lastTestResult.total} />
              <Stat label="passed" value={lastTestResult.passed} />
              <Stat label="failed" value={lastTestResult.failed} />
              <Stat label="warn / err" value={`${lastTestResult.warnings_count} / ${lastTestResult.errors_count}`} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">result</th>
                    <th className="pr-2">case</th>
                    <th className="pr-2">expected</th>
                    <th className="pr-2">actual</th>
                    <th className="pr-2">detail</th>
                  </tr>
                </thead>
                <tbody>
                  {lastTestResult.results.map((t) => (
                    <tr key={t.id} className="border-t align-top">
                      <td className="py-1 pr-2">
                        <Badge variant={t.pass ? "default" : "destructive"}>{t.pass ? "PASS" : "FAIL"}</Badge>
                      </td>
                      <td className="pr-2">{t.name}</td>
                      <td className="pr-2 font-mono">
                        {t.expect_ok
                          ? `${(t.expect_grams ?? 0).toFixed(5)} g`
                          : `error: ${t.expect_error_type ?? "any"}`}
                      </td>
                      <td className="pr-2 font-mono">
                        {t.actual_grams != null
                          ? `${t.actual_grams.toFixed(5)} g`
                          : t.actual_error_type
                            ? `error: ${t.actual_error_type}`
                            : "—"}
                      </td>
                      <td className="pr-2 text-muted-foreground max-w-[40ch]">{t.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="default" asChild>
                <Link
                  to="/admin/pricing-v2/errors"
                  search={{ run_id: lastTestResult.run_id, stage: "catalog_bootstrap_test" } as any}
                >
                  Open Errors Page for this run
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setErrFilterRun(lastTestResult.run_id)}>
                Filter errors below by this run
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportErrorsCsv(lastTestResult.run_id, "catalog_bootstrap_test")}>
                Download Error Report (CSV)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadJson(`pv2-catalog-test-${lastTestResult.run_id}.json`, lastTestResult)}>
                Download Test Summary JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bootstrap Audit Trail — who triggered each attempt, when, and how many products were fetched */}
      <Card>
        <CardHeader>
          <CardTitle>Bootstrap Audit Trail</CardTitle>
          <p className="text-xs text-muted-foreground">
            Every bootstrap attempt — initiator, source, started/ended, duration, and products fetched.
          </p>
        </CardHeader>
        <CardContent className="text-sm">
          {runs.isLoading ? <p>Loading…</p> : (runs.data?.runs ?? []).length === 0 ? (
            <p className="text-muted-foreground text-xs">No bootstrap attempts recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">run_id</th>
                    <th className="pr-2">status</th>
                    <th className="pr-2">initiated by</th>
                    <th className="pr-2">source</th>
                    <th className="pr-2">started</th>
                    <th className="pr-2">ended</th>
                    <th className="pr-2">duration</th>
                    <th className="pr-2 text-right">products fetched</th>
                    <th className="pr-2 text-right">warn</th>
                    <th className="pr-2 text-right">err</th>
                    <th className="pr-2">notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(runs.data?.runs ?? []).map((r: any) => {
                    const initiator =
                      r.initiator?.email ??
                      r.initiator?.full_name ??
                      (r.initiator?.user_id ? `${String(r.initiator.user_id).slice(0, 8)}…` : "system");
                    const durLabel = r.duration_ms == null
                      ? "—"
                      : r.duration_ms < 1000
                        ? `${r.duration_ms}ms`
                        : r.duration_ms < 60_000
                          ? `${(r.duration_ms / 1000).toFixed(1)}s`
                          : `${Math.floor(r.duration_ms / 60_000)}m ${Math.round((r.duration_ms % 60_000) / 1000)}s`;
                    return (
                      <tr key={r.run_id} className="border-t">
                        <td className="py-1 pr-2 font-mono">
                          <button className="underline" onClick={() => setErrFilterRun(r.run_id)}>{r.run_id.slice(0, 8)}…</button>
                        </td>
                        <td className="pr-2">
                          <Badge
                            variant={
                              r.status === "success"
                                ? "default"
                                : r.status === "running"
                                  ? "secondary"
                                  : r.status === "failed"
                                    ? "destructive"
                                    : "outline"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="pr-2 truncate max-w-[20ch]" title={r.initiator?.user_id ?? ""}>{initiator}</td>
                        <td className="pr-2">
                          <Badge variant="outline" className="font-mono text-[10px]">{r.triggered_by ?? "—"}</Badge>
                        </td>
                        <td className="pr-2 whitespace-nowrap">{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</td>
                        <td className="pr-2 whitespace-nowrap">{r.ended_at ? new Date(r.ended_at).toLocaleString() : "—"}</td>
                        <td className="pr-2 whitespace-nowrap">{durLabel}</td>
                        <td className="pr-2 text-right font-mono">{r.products_fetched ?? r.counts_out ?? 0}</td>
                        <td className="pr-2 text-right">{r.warnings_count}</td>
                        <td className="pr-2 text-right">{r.errors_count}</td>
                        <td className="text-muted-foreground truncate max-w-[24ch]" title={r.notes ?? ""}>{r.notes}</td>
                        <td>
                          <div className="flex items-center gap-1 justify-end">
                            {(r.status === "failed" || r.status === "running") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 gap-1 text-[11px]"
                                  disabled={replayMut.isPending && replayMut.variables?.run_id === r.run_id}
                                  onClick={() => replayMut.mutate({ run_id: r.run_id, include_successful: false })}
                                  title="Resume from where the original left off (skips successfully-fetched IDs)"
                                >
                                  {replayMut.isPending && replayMut.variables?.run_id === r.run_id && !replayMut.variables?.include_successful ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Repeat className="w-3 h-3" />
                                  )}
                                  Replay
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px]"
                                  disabled={replayMut.isPending && replayMut.variables?.run_id === r.run_id}
                                  onClick={() => replayMut.mutate({ run_id: r.run_id, include_successful: true })}
                                  title="Reset cursor and reprocess every product ID — re-runs successful stages too (debug)"
                                >
                                  {replayMut.isPending && replayMut.variables?.run_id === r.run_id && replayMut.variables?.include_successful ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    "Full"
                                  )}
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant={r.status === "failed" || r.status === "running" ? "destructive" : "ghost"}
                              className="h-6 px-2 gap-1 text-[11px]"
                              onClick={() => setDetailsRunId(r.run_id)}
                            >
                              <Bug className="w-3 h-3" /> Details
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
            <span>Errors (stage = catalog or catalog_bootstrap_test)</span>
            <div className="flex items-center gap-2 text-sm font-normal">
              <Input className="h-8 w-[26ch] font-mono text-xs" placeholder="filter by run_id" value={errFilterRun} onChange={(e) => setErrFilterRun(e.target.value.trim())} />
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={errFilterSeverity} onChange={(e) => setErrFilterSeverity(e.target.value as any)}>
                <option value="">all severities</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
              </select>
              <Button size="sm" variant="ghost" onClick={() => { setErrFilterRun(""); setErrFilterSeverity(""); }}>Clear</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorsTable rows={errors.data?.errors ?? []} loading={errors.isLoading} />
        </CardContent>
      </Card>

      {/* Products list with per-row Fix Weight */}
      <ProductsCard onChanged={() => qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] })} />

      {/* Fix weight + Trace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FixWeightCard onSaved={() => qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog"] })} />
        <TraceCard />
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open && guardedPhase === "awaiting-confirm") {
            setGuardedPhase("idle");
            setGuardedDryResult(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {guardedDryResult && (guardedDryResult.errors_count ?? 0) > 0 ? (
                <AlertTriangle className="w-5 h-5 text-destructive" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-success" />
              )}
              Dry run complete — proceed with full bootstrap?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Preflight executed against the Kroger API without writing to the catalog.
                  Review the counts before committing.
                </div>
                {guardedDryResult && (
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3 font-mono text-xs">
                    <div>run_id: <span className="break-all">{guardedDryResult.run_id}</span></div>
                    <div>store_id: {guardedDryResult.store_id}</div>
                    <div>counts_in: {guardedDryResult.counts_in}</div>
                    <div>counts_out: {guardedDryResult.counts_out}</div>
                    <div>warnings: {guardedDryResult.warnings_count}</div>
                    <div className={(guardedDryResult.errors_count ?? 0) > 0 ? "text-destructive" : ""}>
                      errors: {guardedDryResult.errors_count}
                    </div>
                  </div>
                )}
                {guardedDryResult && (guardedDryResult.errors_count ?? 0) > 0 && (
                  <div className="text-destructive text-xs">
                    Dry run reported errors. You can still proceed, but consider reviewing the
                    Errors panel below first.
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  The full run will write rows to <span className="font-mono">pricing_v2_kroger_catalog_raw</span>{" "}
                  and <span className="font-mono">pricing_v2_item_catalog</span>.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFullRun}>
              Run full bootstrap
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bootstrap Run Details — surfaces exact Supabase update error / enum mismatch */}
      <BootstrapRunDetailsDialog
        runId={detailsRunId}
        open={!!detailsRunId}
        onOpenChange={(o) => { if (!o) setDetailsRunId(null); }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ErrorsTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <p className="text-sm">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No errors for this filter.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1 pr-2">severity</th><th>type</th><th>entity_id</th><th>message</th><th>suggested_fix</th><th>debug</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t align-top">
              <td className="py-1 pr-2"><Badge variant={e.severity === "error" ? "destructive" : "secondary"}>{e.severity}</Badge></td>
              <td className="font-mono">{e.type}</td>
              <td className="font-mono break-all max-w-[28ch]">{e.entity_id ?? "—"}</td>
              <td className="max-w-[40ch]">{e.message}</td>
              <td className="max-w-[30ch] text-muted-foreground">{e.suggested_fix}</td>
              <td>
                <details>
                  <summary className="cursor-pointer text-muted-foreground">view</summary>
                  <pre className="text-[10px] whitespace-pre-wrap break-all max-w-[40ch]">{JSON.stringify(e.debug_json, null, 2)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FixWeightCard({ onSaved }: { onSaved: () => void }) {
  const [productKey, setProductKey] = useState("");
  const [grams, setGrams] = useState("");
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => setManualWeight({ data: { product_key: productKey, grams: Number(grams), reason } }),
    onSuccess: () => { toast.success("Manual weight saved"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });
  const reparse = useMutation({
    mutationFn: () => reparseCatalogItem({ data: { product_key: productKey } }),
    onSuccess: (r: any) => {
      if (r.ok) toast.success(`Re-parsed: ${Math.round(r.net_weight_grams)} g (${r.source})`);
      else toast.error(`Re-parse failed: ${r.failure} — ${r.reason}`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Re-parse failed"),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Fix Weight (manual override)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>product_key</Label>
          <Input value={productKey} onChange={(e) => setProductKey(e.target.value)} placeholder="store_id:kroger_product_id:upc_or_NOUPC" className="font-mono text-xs" />
        </div>
        <div>
          <Label>net weight (grams)</Label>
          <Input value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" />
        </div>
        <div>
          <Label>reason</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={!productKey || !grams || !reason || save.isPending}>Save Manual Weight</Button>
          <Button variant="outline" onClick={() => reparse.mutate()} disabled={!productKey || reparse.isPending}>Re-run parsing</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TraceCard() {
  const [productKey, setProductKey] = useState("");
  const [trace, setTrace] = useState<any>(null);
  const traceMut = useMutation({
    mutationFn: () => traceCatalogProduct({ data: { product_key: productKey } }),
    onSuccess: (r) => setTrace(r),
    onError: (e: any) => toast.error(e?.message ?? "Trace failed"),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Trace Preview</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={productKey} onChange={(e) => setProductKey(e.target.value)} placeholder="product_key" className="font-mono text-xs" />
          <Button onClick={() => traceMut.mutate()} disabled={!productKey || traceMut.isPending}>Trace</Button>
        </div>
        {trace && (
          <div className="space-y-2 text-xs">
            <div>
              <div className="font-medium">Item</div>
              <pre className="bg-muted p-2 rounded max-h-48 overflow-auto">{JSON.stringify(trace.item, null, 2)}</pre>
            </div>
            <div>
              <div className="font-medium">Parse</div>
              <pre className="bg-muted p-2 rounded max-h-48 overflow-auto">{JSON.stringify(trace.parse, null, 2)}</pre>
            </div>
            <div>
              <div className="font-medium">Latest raw payload</div>
              <pre className="bg-muted p-2 rounded max-h-64 overflow-auto">{JSON.stringify(trace.raws?.[0] ?? null, null, 2)}</pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- helpers --------------------------------------------------------------

function downloadJson(name: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportErrorsCsv(runId: string, stage?: "catalog_bootstrap_test") {
  const res = stage === "catalog_bootstrap_test"
    ? await listCatalogTestErrors({ data: { run_id: runId, limit: 1000 } })
    : await listCatalogRunErrors({ data: { run_id: runId, limit: 1000 } });
  const rows = res.errors;
  const headers = ["created_at", "severity", "type", "entity_id", "entity_name", "message", "suggested_fix"];
  const csv = [
    headers.join(","),
    ...rows.map((r: any) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pv2-catalog-errors-${runId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AlertConfigForm({ initial, onSave, saving, onTest, testing }: { initial: any; onSave: (v: any) => void; saving: boolean; onTest: () => void; testing: boolean }) {
  const [threshold, setThreshold] = useState<number>(initial.stuck_minutes_threshold ?? 30);
  const [bannerEnabled, setBannerEnabled] = useState<boolean>(!!initial.banner_enabled);
  const [emailEnabled, setEmailEnabled] = useState<boolean>(!!initial.email_enabled);
  const [recipients, setRecipients] = useState<string>((initial.email_recipients ?? []).join(", "));
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(!!initial.webhook_enabled);
  const [webhookUrl, setWebhookUrl] = useState<string>(initial.webhook_url ?? "");
  const [webhookSecret, setWebhookSecret] = useState<string>(initial.webhook_secret ?? "");
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Label className="w-44">Stuck threshold (minutes)</Label>
        <Input type="number" min={1} max={1440} className="h-8 w-28" value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value) || 1)} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={bannerEnabled} onChange={(e) => setBannerEnabled(e.target.checked)} />
        <Label>Banner enabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
        <Label>Email enabled</Label>
        <Input className="h-8 flex-1" placeholder="comma-separated emails" value={recipients}
          onChange={(e) => setRecipients(e.target.value)} disabled={!emailEnabled} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={webhookEnabled} onChange={(e) => setWebhookEnabled(e.target.checked)} />
        <Label className="w-32">Webhook enabled</Label>
        <Input className="h-8 flex-1" placeholder="https://..." value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)} disabled={!webhookEnabled} />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-44">Webhook signing secret</Label>
        <Input className="h-8 flex-1 font-mono text-xs" placeholder="optional" value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)} disabled={!webhookEnabled} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => onSave({
          stuck_minutes_threshold: threshold,
          banner_enabled: bannerEnabled,
          email_enabled: emailEnabled,
          email_recipients: recipients.split(",").map((s) => s.trim()).filter(Boolean),
          webhook_enabled: webhookEnabled,
          webhook_url: webhookUrl.trim() || null,
          webhook_secret: webhookSecret.trim() || null,
        })}>{saving ? "Saving…" : "Save alert config"}</Button>
        <Button size="sm" variant="outline" disabled={testing} onClick={onTest}>
          {testing ? "Sending…" : "Send test alert"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Test sends a synthetic alert through all currently-saved enabled channels (banner + email + webhook). Save first if you've changed anything.
      </p>
    </div>
  );
}

// ---- Products list with per-row Fix Weight -------------------------------

function ProductsCard({ onChanged }: { onChanged: () => void }) {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const limit = 50;

  const products = useQuery({
    queryKey: ["pricing-v2", "catalog", "products", { search, sourceFilter, onlyMissing, page }],
    queryFn: () =>
      listCatalogProducts({
        data: {
          search: search || undefined,
          weight_source: sourceFilter === "all" ? undefined : sourceFilter,
          only_missing_weight: onlyMissing || undefined,
          limit,
          offset: page * limit,
        },
      }),
  });

  const total = products.data?.total ?? 0;
  const rows = products.data?.products ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Products ({total.toLocaleString()})</span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search name, brand, UPC…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(searchInput);
                  setPage(0);
                }
              }}
              className="w-56 text-xs"
            />
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40 text-xs"><SelectValue placeholder="weight_source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="parsed">parsed</SelectItem>
                <SelectItem value="manual_override">manual_override</SelectItem>
                <SelectItem value="unparsed">unparsed</SelectItem>
                <SelectItem value="unknown">unknown</SelectItem>
                <SelectItem value="label">label</SelectItem>
                <SelectItem value="vendor">vendor</SelectItem>
                <SelectItem value="estimated">estimated</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={onlyMissing} onCheckedChange={(v) => { setOnlyMissing(!!v); setPage(0); }} />
              Missing weight only
            </label>
            <Button size="sm" variant="ghost" onClick={() => products.refetch()}>Refresh</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {products.isLoading ? (
          <p className="text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products match the current filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">name</th>
                  <th className="py-1 pr-2">brand</th>
                  <th className="py-1 pr-2">upc</th>
                  <th className="py-1 pr-2">size_raw</th>
                  <th className="py-1 pr-2">net_g</th>
                  <th className="py-1 pr-2">source</th>
                  <th className="py-1 pr-2 text-right">action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.product_key} className="border-t align-top">
                    <td className="py-1 pr-2 max-w-[28ch]">{p.name ?? "—"}</td>
                    <td className="py-1 pr-2 max-w-[16ch]">{p.brand ?? "—"}</td>
                    <td className="py-1 pr-2 font-mono">{p.upc ?? "—"}</td>
                    <td className="py-1 pr-2">{p.size_raw ?? "—"}</td>
                    <td className="py-1 pr-2 font-mono">
                      {p.net_weight_grams != null ? Math.round(Number(p.net_weight_grams)) : "—"}
                    </td>
                    <td className="py-1 pr-2">
                      <Badge variant={p.weight_source === "manual_override" ? "default" : "secondary"}>
                        {p.weight_source ?? "—"}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                        <Wrench className="w-3 h-3 mr-1" /> Fix Weight
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            Showing {rows.length === 0 ? 0 : page * limit + 1}–{page * limit + rows.length} of {total.toLocaleString()}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </CardContent>

      <FixWeightDialog
        product={editing}
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => { setEditing(null); products.refetch(); onChanged(); }}
      />
    </Card>
  );
}

function FixWeightDialog({
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  product: any | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [grams, setGrams] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<string>("manual_override");

  // Reset fields whenever a new product is opened
  useMemo(() => {
    if (product) {
      setGrams(product.net_weight_grams != null ? String(Math.round(Number(product.net_weight_grams))) : "");
      setReason(product.manual_override_reason ?? "");
      setSource(product.weight_source ?? "manual_override");
    }
  }, [product?.product_key]);

  const save = useMutation({
    mutationFn: () =>
      setManualWeight({
        data: {
          product_key: product.product_key,
          grams: Number(grams),
          reason,
          weight_source: source as any,
        },
      }),
    onSuccess: () => {
      toast.success("Weight saved");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fix Weight</DialogTitle>
          <DialogDescription>
            Manually set <span className="font-mono">net_weight_grams</span> and{" "}
            <span className="font-mono">weight_source</span> for this product. A reason is required for the audit trail.
          </DialogDescription>
        </DialogHeader>
        {product && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-2 text-xs">
              <div className="font-medium">{product.name ?? "—"} <span className="text-muted-foreground">({product.brand ?? "—"})</span></div>
              <div className="font-mono text-muted-foreground break-all">{product.product_key}</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-muted-foreground">
                <div>upc: <span className="font-mono">{product.upc ?? "—"}</span></div>
                <div>size_raw: {product.size_raw ?? "—"}</div>
              </div>
            </div>
            <div>
              <Label>Net weight (grams)</Label>
              <Input
                value={grams}
                onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="e.g. 454"
              />
            </div>
            <div>
              <Label>Weight source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_override">manual_override</SelectItem>
                  <SelectItem value="label">label</SelectItem>
                  <SelectItem value="vendor">vendor</SelectItem>
                  <SelectItem value="estimated">estimated</SelectItem>
                  <SelectItem value="parsed">parsed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this override (e.g. weighed package on scale, vendor spec sheet, etc.)"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!product || !grams || !reason || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
