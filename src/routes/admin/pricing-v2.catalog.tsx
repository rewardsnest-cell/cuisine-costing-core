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
import { CheckCircle2, AlertTriangle, Loader2, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
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
} from "@/lib/server-fns/pricing-v2-catalog.functions";

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

  const [batchSize, setBatchSize] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string>("");

  // Guarded "Run Bootstrap" flow: dry-run first, then confirm full run.
  const [guardedPhase, setGuardedPhase] = useState<"idle" | "dry-running" | "awaiting-confirm" | "full-running">("idle");
  const [guardedDryResult, setGuardedDryResult] = useState<RunResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runGuarded = async () => {
    try {
      setGuardedPhase("dry-running");
      setGuardedDryResult(null);
      const dry = await runCatalogBootstrap({
        data: { dry_run: true, batch_size: batchNum ?? 50, keyword: keyword || undefined },
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
        data: { dry_run: false, batch_size: batchNum, keyword: keyword || undefined },
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
    mutationFn: (vars: { dry_run: boolean; batch_size?: number; keyword?: string }) =>
      runCatalogBootstrap({ data: vars }),
    onSuccess: (res: any) => {
      setLastResult(res);
      if (res.run_id) setErrFilterRun(res.run_id);
      if (res.skipped) toast.info(res.message ?? "Bootstrap already completed");
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
              <Button
                onClick={runGuarded}
                disabled={runMut.isPending || guardedPhase === "dry-running" || guardedPhase === "full-running"}
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
                onClick={() => runMut.mutate({ dry_run: false, batch_size: batchNum, keyword: keyword || undefined })}
                disabled={runMut.isPending || guardedPhase !== "idle"}
                className="gap-1.5"
                title="Skip the dry-run preflight and run immediately"
              >
                <Play className="w-4 h-4" />
                Run Now (skip dry-run)
              </Button>
              <Button
                variant="ghost"
                onClick={() => runMut.mutate({ dry_run: true, batch_size: 50 })}
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

      {/* Recent runs */}
      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {runs.isLoading ? <p>Loading…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-2">run_id</th><th>status</th><th>started</th><th>in</th><th>out</th><th>warn</th><th>err</th><th>notes</th></tr>
                </thead>
                <tbody>
                  {(runs.data?.runs ?? []).map((r: any) => (
                    <tr key={r.run_id} className="border-t">
                      <td className="py-1 pr-2 font-mono">
                        <button className="underline" onClick={() => setErrFilterRun(r.run_id)}>{r.run_id.slice(0, 8)}…</button>
                      </td>
                      <td>{r.status}</td>
                      <td>{new Date(r.started_at).toLocaleString()}</td>
                      <td>{r.counts_in}</td><td>{r.counts_out}</td>
                      <td>{r.warnings_count}</td><td>{r.errors_count}</td>
                      <td className="text-muted-foreground truncate max-w-[24ch]">{r.notes}</td>
                    </tr>
                  ))}
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
