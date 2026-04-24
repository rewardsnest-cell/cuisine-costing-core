import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ShieldAlert, Check, X, Pencil, Info, Eye, RefreshCw, AlertTriangle, FlaskConical, TrendingUp, TrendingDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  listCostUpdateQueue,
  approveCostUpdate,
  rejectCostUpdate,
  overrideCostUpdate,
  bulkApproveCostUpdates,
  bulkRejectCostUpdates,
  listIngredientCosts,
  recomputeAndVerifyInternalCosts,
  simulateApplyCostUpdates,
} from "@/lib/server-fns/cost-intelligence.functions";
import { CostBreakdownPanel } from "@/components/admin/CostBreakdownPanel";

type SimulateResult = Awaited<ReturnType<typeof simulateApplyCostUpdates>>;

type VerifyResult = Awaited<ReturnType<typeof recomputeAndVerifyInternalCosts>>;

export const Route = createFileRoute("/admin/cost-queue")({
  head: () => ({ meta: [{ title: "Cost Update Queue — Admin" }] }),
  component: CostQueuePage,
});

type QueueRow = Awaited<ReturnType<typeof listCostUpdateQueue>>[number];
type IngRow = Awaited<ReturnType<typeof listIngredientCosts>>[number];

function CostQueuePage() {
  const [tab, setTab] = useState<"pending" | "history" | "items">("pending");
  const [pending, setPending] = useState<QueueRow[]>([]);
  const [history, setHistory] = useState<QueueRow[]>([]);
  const [items, setItems] = useState<IngRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [breakdownRef, setBreakdownRef] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyOnlyFlagged, setVerifyOnlyFlagged] = useState(true);
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simSourceIds, setSimSourceIds] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [p, h, it] = await Promise.all([
        listCostUpdateQueue({ data: { status: "pending" } }),
        listCostUpdateQueue({ data: { status: "approved" } }),
        listIngredientCosts({ data: { search, limit: 200 } }),
      ]);
      setPending(p);
      setHistory(h);
      setItems(it);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApprove = async (id: string) => {
    setActingId(id);
    try {
      await approveCostUpdate({ data: { queue_id: id } });
      toast.success("Cost update approved & applied");
      await load();
    } catch (e: any) { toast.error(e?.message || "Approve failed"); }
    finally { setActingId(null); }
  };
  const onReject = async (id: string) => {
    setActingId(id);
    try {
      await rejectCostUpdate({ data: { queue_id: id } });
      toast.success("Update rejected");
      await load();
    } catch (e: any) { toast.error(e?.message || "Reject failed"); }
    finally { setActingId(null); }
  };
  const onOverride = async (id: string) => {
    const v = window.prompt("Enter manual unit cost (overrides proposal):");
    if (!v) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) { toast.error("Invalid cost"); return; }
    setActingId(id);
    try {
      await overrideCostUpdate({ data: { queue_id: id, manual_cost: n } });
      toast.success("Manual override applied");
      await load();
    } catch (e: any) { toast.error(e?.message || "Override failed"); }
    finally { setActingId(null); }
  };

  const allSelected = pending.length > 0 && selected.size === pending.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pending.map((p: any) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const reportBulk = (verb: "approved" | "rejected", res: { count: number; ok_count: number; fail_count: number; results: { ok: boolean; item_name?: string | null; error?: string }[] }) => {
    if (res.fail_count === 0) {
      toast.success(`${res.ok_count}/${res.count} ${verb}`);
    } else {
      const failures = res.results.filter((r) => !r.ok).slice(0, 5);
      const lines = failures.map((f) => `• ${f.item_name ?? "item"}: ${f.error ?? "unknown error"}`).join("\n");
      toast.warning(`${res.ok_count}/${res.count} ${verb} — ${res.fail_count} failed`, {
        description: lines + (res.fail_count > failures.length ? `\n…and ${res.fail_count - failures.length} more` : ""),
        duration: 8000,
      });
    }
  };
  const onBulkApprove = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Approve ${selected.size} cost update${selected.size === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      const res = await bulkApproveCostUpdates({ data: { queue_ids: Array.from(selected) } });
      reportBulk("approved", res);
      setSelected(new Set());
      await load();
    } catch (e: any) { toast.error(e?.message || "Bulk approve failed"); }
    finally { setBulkBusy(false); }
  };
  const onBulkReject = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Reject ${selected.size} cost update${selected.size === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      const res = await bulkRejectCostUpdates({ data: { queue_ids: Array.from(selected) } });
      reportBulk("rejected", res);
      setSelected(new Set());
      await load();
    } catch (e: any) { toast.error(e?.message || "Bulk reject failed"); }
    finally { setBulkBusy(false); }
  };

  const onRecomputeVerify = async () => {
    setVerifyBusy(true);
    try {
      const res = await recomputeAndVerifyInternalCosts({ data: {} });
      setVerifyResult(res);
      const flagged = res.summary.abnormal + res.summary.no_sources;
      if (flagged === 0) toast.success(`Verified ${res.summary.checked} items — no issues found`);
      else toast.warning(`${flagged} of ${res.summary.checked} items need attention`, {
        description: `${res.summary.abnormal} abnormal Δ · ${res.summary.no_sources} with no sources`,
      });
    } catch (e: any) { toast.error(e?.message || "Verification failed"); }
    finally { setVerifyBusy(false); }
  };

  const runSimulation = async (ids: string[]) => {
    if (ids.length === 0) { toast.error("Select at least one row to simulate"); return; }
    setSimBusy(true);
    setSimSourceIds(ids);
    setSimOpen(true);
    setSimResult(null);
    try {
      const res = await simulateApplyCostUpdates({ data: { queue_ids: ids } });
      setSimResult(res);
      toast.success(
        `Simulated ${res.summary.queue_rows} update(s): ${res.summary.recipes} recipe(s), ${res.summary.quotes} quote(s) impacted`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Simulation failed");
      setSimOpen(false);
    } finally {
      setSimBusy(false);
    }
  };

  const onSimulateSelected = () => runSimulation(Array.from(selected));
  const onSimulateOne = (id: string) => runSimulation([id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Cost Update Queue</h1>
        <p className="text-sm text-muted-foreground">
          Internal pricing intelligence — not customer-facing. Updates exceeding ±5% require admin approval.
        </p>
      </div>

      <Alert>
        <Info className="w-4 h-4" />
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription>
          The internal estimated cost is a weighted average of Kroger (40%), manual (40%), and historical (20%) sources.
          When a proposed update would shift the estimate by more than ±5%, it is held here for explicit approval.
          Manual costs can never be overwritten by Kroger fetches.
        </AlertDescription>
      </Alert>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending {pending.length > 0 && <Badge variant="destructive" className="ml-2">{pending.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="items">Item Costs</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" />Pending approval</CardTitle>
                {selected.size > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                    <Button size="sm" variant="outline" disabled={simBusy} onClick={onSimulateSelected} className="gap-1" title="Project inventory + recipe + quote impact without writing data">
                      {simBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                      Simulate apply
                    </Button>
                    <Button size="sm" variant="outline" disabled={bulkBusy} onClick={onBulkApprove} className="gap-1"><Check className="w-3.5 h-3.5" />Bulk Approve</Button>
                    <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={onBulkReject} className="gap-1 text-destructive"><X className="w-3.5 h-3.5" />Bulk Reject</Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
              ) : pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending cost updates. All recent changes were within the ±5% safe band.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Proposed</TableHead>
                        <TableHead>% change</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.map((r: any) => {
                        const pct = Number(r.percent_change ?? 0);
                        const direction = pct >= 0 ? "+" : "";
                        return (
                          <TableRow key={r.id}>
                            <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="Select row" /></TableCell>
                            <TableCell className="font-medium">{r.ingredient_reference?.canonical_name ?? r.reference_id} <span className="text-xs text-muted-foreground">/ {r.ingredient_reference?.default_unit}</span></TableCell>
                            <TableCell>${Number(r.current_cost ?? 0).toFixed(4)}</TableCell>
                            <TableCell>${Number(r.proposed_cost ?? 0).toFixed(4)}</TableCell>
                            <TableCell><Badge variant={Math.abs(pct) > 15 ? "destructive" : "secondary"}>{direction}{pct.toFixed(2)}%</Badge></TableCell>
                            <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setBreakdownRef(r.reference_id)} className="gap-1"><Eye className="w-3.5 h-3.5" />View</Button>
                                <Button size="sm" variant="ghost" disabled={simBusy} onClick={() => onSimulateOne(r.id)} className="gap-1" title="Simulate apply (no writes)"><FlaskConical className="w-3.5 h-3.5" />Simulate</Button>
                                <Button size="sm" variant="outline" disabled={actingId === r.id} onClick={() => onApprove(r.id)} className="gap-1"><Check className="w-3.5 h-3.5" />Approve</Button>
                                <Button size="sm" variant="outline" disabled={actingId === r.id} onClick={() => onOverride(r.id)} className="gap-1"><Pencil className="w-3.5 h-3.5" />Override</Button>
                                <Button size="sm" variant="ghost" disabled={actingId === r.id} onClick={() => onReject(r.id)} className="gap-1 text-destructive"><X className="w-3.5 h-3.5" />Reject</Button>
                              </div>
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
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Recent approved updates</CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div> : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approval history yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Old</TableHead><TableHead>Proposed</TableHead><TableHead>Applied</TableHead><TableHead>%</TableHead><TableHead>Reviewed</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {history.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.ingredient_reference?.canonical_name ?? r.reference_id}</TableCell>
                          <TableCell>${Number(r.current_cost ?? 0).toFixed(4)}</TableCell>
                          <TableCell>${Number(r.proposed_cost ?? 0).toFixed(4)}</TableCell>
                          <TableCell>${Number(r.final_applied_cost ?? 0).toFixed(4)}</TableCell>
                          <TableCell>{Number(r.percent_change ?? 0).toFixed(2)}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Item cost intelligence</CardTitle>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRecomputeVerify}
                    disabled={verifyBusy}
                    className="gap-1"
                    title="Recalculate internal_estimated_unit_cost from weighted inputs and flag missing sources or abnormal deltas (read-only)."
                  >
                    {verifyBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Recompute & verify
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
                <Button variant="outline" onClick={load}>Search</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {verifyResult && (
                <Card className="border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Verification report
                      </CardTitle>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="outline">{verifyResult.summary.checked} checked</Badge>
                        <Badge variant={verifyResult.summary.abnormal > 0 ? "destructive" : "outline"}>
                          {verifyResult.summary.abnormal} abnormal Δ (&gt; {Math.round(verifyResult.summary.delta_threshold_pct * 100)}%)
                        </Badge>
                        <Badge variant={verifyResult.summary.no_sources > 0 ? "destructive" : "outline"}>
                          {verifyResult.summary.no_sources} no sources
                        </Badge>
                        <Badge variant="secondary">missing K {verifyResult.summary.missing_kroger}</Badge>
                        <Badge variant="secondary">missing M {verifyResult.summary.missing_manual}</Badge>
                        <Badge variant="secondary">missing H {verifyResult.summary.missing_historical}</Badge>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <label className="text-xs flex items-center gap-1.5">
                          <Checkbox checked={verifyOnlyFlagged} onCheckedChange={(v) => setVerifyOnlyFlagged(v === true)} />
                          Only show flagged
                        </label>
                        <Button size="sm" variant="ghost" onClick={() => setVerifyResult(null)} className="gap-1">
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const flagged = verifyResult.rows.filter(
                        (r) => r.abnormal || r.no_sources || r.missing_sources.length > 0,
                      );
                      const display = verifyOnlyFlagged ? flagged : verifyResult.rows;
                      if (display.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground">
                            No items to show. {verifyOnlyFlagged ? "Toggle off the filter to see all checked rows." : ""}
                          </p>
                        );
                      }
                      return (
                        <div className="overflow-x-auto max-h-[420px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Stored</TableHead>
                                <TableHead>Computed</TableHead>
                                <TableHead>Δ</TableHead>
                                <TableHead>Missing sources</TableHead>
                                <TableHead className="text-right">View</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {display.slice(0, 200).map((r) => {
                                const dPct = r.delta_pct == null ? null : r.delta_pct * 100;
                                return (
                                  <TableRow key={r.reference_id}>
                                    <TableCell className="font-medium">
                                      {r.canonical_name}{" "}
                                      <span className="text-xs text-muted-foreground">/ {r.default_unit}</span>
                                    </TableCell>
                                    <TableCell>{r.stored_estimate == null ? "—" : `$${r.stored_estimate.toFixed(4)}`}</TableCell>
                                    <TableCell>{r.computed_estimate == null ? "—" : `$${r.computed_estimate.toFixed(4)}`}</TableCell>
                                    <TableCell>
                                      {dPct == null ? (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      ) : (
                                        <Badge variant={r.abnormal ? "destructive" : "outline"}>
                                          {dPct >= 0 ? "+" : ""}
                                          {dPct.toFixed(2)}%
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {r.no_sources ? (
                                        <Badge variant="destructive">no sources</Badge>
                                      ) : r.missing_sources.length === 0 ? (
                                        <span className="text-muted-foreground">—</span>
                                      ) : (
                                        <span className="space-x-1">
                                          {r.missing_sources.map((m) => (
                                            <Badge key={m} variant="secondary" className="text-[10px]">
                                              {m.replace("missing_", "")}
                                            </Badge>
                                          ))}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button size="sm" variant="ghost" onClick={() => setBreakdownRef(r.reference_id)} className="gap-1">
                                        <Eye className="w-3.5 h-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          {display.length > 200 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Showing first 200 of {display.length} flagged rows.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Kroger</TableHead>
                        <TableHead>Manual</TableHead>
                        <TableHead>Historical</TableHead>
                        <TableHead className="font-bold">Internal Estimate</TableHead>
                        <TableHead>Weights</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r: any) => {
                        const w = r.internal_cost_weights ?? {};
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.canonical_name} <span className="text-xs text-muted-foreground">/ {r.default_unit}</span></TableCell>
                            <TableCell>{r.kroger_unit_cost != null ? `$${Number(r.kroger_unit_cost).toFixed(4)}` : "—"}</TableCell>
                            <TableCell>{r.manual_unit_cost != null ? `$${Number(r.manual_unit_cost).toFixed(4)}` : "—"}</TableCell>
                            <TableCell>{r.historical_avg_unit_cost != null ? `$${Number(r.historical_avg_unit_cost).toFixed(4)}` : "—"}</TableCell>
                            <TableCell className="font-bold">{r.internal_estimated_unit_cost != null ? `$${Number(r.internal_estimated_unit_cost).toFixed(4)}` : "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {w.kroger ? `K ${Math.round(w.kroger * 100)}%` : ""} {w.manual ? `M ${Math.round(w.manual * 100)}%` : ""} {w.historical ? `H ${Math.round(w.historical * 100)}%` : ""}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.internal_estimated_unit_cost_updated_at ? new Date(r.internal_estimated_unit_cost_updated_at).toLocaleDateString() : "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => setBreakdownRef(r.id)} className="gap-1"><Eye className="w-3.5 h-3.5" />View</Button>
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
        </TabsContent>
      </Tabs>

      <Sheet open={!!breakdownRef} onOpenChange={(o) => !o && setBreakdownRef(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>Cost Breakdown</SheetTitle></SheetHeader>
          <div className="mt-4">{breakdownRef && <CostBreakdownPanel referenceId={breakdownRef} />}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={simOpen} onOpenChange={setSimOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><FlaskConical className="w-4 h-4" />Simulate apply — read-only impact</SheetTitle>
            <SheetDescription>
              Projects what would happen if you approved {simSourceIds.length} update{simSourceIds.length === 1 ? "" : "s"}.
              No data is written. Approve manually if the projection looks right.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            {simBusy && !simResult && (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Running simulation…</div>
            )}
            {simResult && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <SimStat label="Queue rows" value={simResult.summary.queue_rows} />
                  <SimStat label="Inventory items" value={simResult.summary.inventory_items} />
                  <SimStat label="Recipes" value={simResult.summary.recipes} />
                  <SimStat label="Quotes" value={simResult.summary.quotes} />
                  <SimStat
                    label="Total quote Δ"
                    value={`${simResult.summary.total_quote_delta >= 0 ? "+" : ""}$${simResult.summary.total_quote_delta.toFixed(2)}`}
                    tone={simResult.summary.total_quote_delta > 0 ? "up" : simResult.summary.total_quote_delta < 0 ? "down" : "flat"}
                  />
                </div>

                {simResult.warnings.length > 0 && (
                  <Alert>
                    <Info className="w-4 h-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside text-xs">
                        {simResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <SimSection title="Internal estimate changes">
                  {simResult.queue.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No items to recompute.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Item</TableHead><TableHead>Source</TableHead>
                        <TableHead>Current est.</TableHead><TableHead>Projected est.</TableHead><TableHead>Δ</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {simResult.queue.map((q) => (
                          <TableRow key={q.queue_id}>
                            <TableCell className="font-medium">{q.canonical_name} <span className="text-xs text-muted-foreground">/ {q.default_unit}</span></TableCell>
                            <TableCell><Badge variant="outline">{q.source}</Badge></TableCell>
                            <TableCell>{q.current_estimate == null ? "—" : `$${q.current_estimate.toFixed(4)}`}</TableCell>
                            <TableCell>${q.proposed_estimate.toFixed(4)}</TableCell>
                            <TableCell><DeltaBadge pct={q.estimate_delta_pct} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </SimSection>

                <SimSection title="Inventory item impact">
                  {simResult.inventory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No inventory items linked.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Inventory item</TableHead>
                        <TableHead>Current avg cost</TableHead><TableHead>Projected</TableHead><TableHead>Δ</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {simResult.inventory.map((i) => (
                          <TableRow key={i.inventory_item_id}>
                            <TableCell className="font-medium">{i.inventory_name}</TableCell>
                            <TableCell>{i.current_avg_cost == null ? "—" : `$${i.current_avg_cost.toFixed(4)}`}</TableCell>
                            <TableCell>{i.projected_avg_cost == null ? "—" : `$${i.projected_avg_cost.toFixed(4)}`}</TableCell>
                            <TableCell><DeltaBadge pct={i.delta_pct} abs={i.delta_abs} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </SimSection>

                <SimSection title={`Recipe cost-per-serving impact (${simResult.recipes.length})`}>
                  {simResult.recipes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No recipes use these ingredients.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Recipe</TableHead><TableHead>Current /serving</TableHead>
                        <TableHead>Projected</TableHead><TableHead>Δ /serving</TableHead><TableHead>Δ %</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {simResult.recipes.slice(0, 100).map((r) => (
                          <TableRow key={r.recipe_id}>
                            <TableCell className="font-medium">{r.recipe_name} <span className="text-xs text-muted-foreground">({r.servings} sv)</span></TableCell>
                            <TableCell>{r.current_cost_per_serving == null ? "—" : `$${r.current_cost_per_serving.toFixed(4)}`}</TableCell>
                            <TableCell>${r.projected_cost_per_serving.toFixed(4)}</TableCell>
                            <TableCell>{r.delta_per_serving >= 0 ? "+" : ""}${r.delta_per_serving.toFixed(4)}</TableCell>
                            <TableCell><DeltaBadge pct={r.delta_pct} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {simResult.recipes.length > 100 && (
                    <p className="text-xs text-muted-foreground mt-2">Showing first 100 of {simResult.recipes.length} recipes.</p>
                  )}
                </SimSection>

                <SimSection title={`Active quote impact (${simResult.quotes.length})`}>
                  {simResult.quotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No active quotes affected.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Quote</TableHead><TableHead>Status</TableHead>
                        <TableHead>Items</TableHead><TableHead>Current subtotal</TableHead>
                        <TableHead>Projected</TableHead><TableHead>Δ</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {simResult.quotes.slice(0, 50).map((q) => (
                          <TableRow key={q.quote_id}>
                            <TableCell className="font-medium">
                              {q.client_name ?? "—"}
                              {q.event_date && <div className="text-xs text-muted-foreground">{new Date(q.event_date).toLocaleDateString()}</div>}
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{q.status ?? "—"}</Badge></TableCell>
                            <TableCell>{q.affected_items}</TableCell>
                            <TableCell>${q.current_subtotal.toFixed(2)}</TableCell>
                            <TableCell>${q.projected_subtotal.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={q.delta_abs > 0 ? "text-destructive font-medium" : q.delta_abs < 0 ? "text-emerald-600 font-medium" : ""}>
                                {q.delta_abs >= 0 ? "+" : ""}${q.delta_abs.toFixed(2)}
                                {q.delta_pct != null && <span className="text-xs ml-1">({(q.delta_pct * 100).toFixed(2)}%)</span>}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {simResult.quotes.length > 50 && (
                    <p className="text-xs text-muted-foreground mt-2">Showing first 50 of {simResult.quotes.length} quotes.</p>
                  )}
                </SimSection>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="ghost" onClick={() => setSimOpen(false)}>Close</Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SimStat({ label, value, tone }: { label: string; value: number | string; tone?: "up" | "down" | "flat" }) {
  const toneClass = tone === "up" ? "text-destructive" : tone === "down" ? "text-emerald-600" : "";
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function SimSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="border rounded-md overflow-x-auto">{children}</div>
    </div>
  );
}

function DeltaBadge({ pct, abs }: { pct: number | null; abs?: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const p = pct * 100;
  const Icon = p > 0 ? TrendingUp : p < 0 ? TrendingDown : null;
  const variant: "destructive" | "secondary" | "outline" = Math.abs(p) > 5 ? "destructive" : Math.abs(p) > 0 ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="gap-1">
      {Icon && <Icon className="w-3 h-3" />}
      {p >= 0 ? "+" : ""}{p.toFixed(2)}%
      {abs != null && <span className="opacity-70 ml-1">({abs >= 0 ? "+" : ""}${abs.toFixed(4)})</span>}
    </Badge>
  );
}
