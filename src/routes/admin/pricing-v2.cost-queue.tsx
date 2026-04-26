// Pricing v2 — Stage 4: Cost Update Approval Queue.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Play, CheckCircle2, XCircle, AlertTriangle, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import {
  runStage4ComputeCosts,
  listCostUpdateQueue,
  decideCostUpdate,
  listBlockedInventory,
  getInventoryCostAuditLog,
} from "@/lib/server-fns/pricing-v2-stage4-costs.functions";

export const Route = createFileRoute("/admin/pricing-v2/cost-queue")({
  head: () => ({ meta: [{ title: "Pricing v2 — Cost Approval Queue" }] }),
  component: CostQueuePage,
});

function fmtCpg(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(5)}/g`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(Number(n) * 100).toFixed(1)}%`;
}
function srcBadge(s: string) {
  const variant = s === "signals" ? "default" : s === "category_median" ? "destructive" : "secondary";
  return <Badge variant={variant as any} className="text-xs">{s}</Badge>;
}

function CostQueuePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "auto_applied" | "approved" | "rejected" | "blocked">("pending");
  const [auditFor, setAuditFor] = useState<{ id: string; name: string } | null>(null);

  const queue = useQuery({
    queryKey: ["pricing-v2", "cost-queue", tab],
    enabled: tab !== "blocked",
    queryFn: () => listCostUpdateQueue({ data: { status: tab as any, limit: 200 } }),
  });
  const blocked = useQuery({
    queryKey: ["pricing-v2", "cost-queue", "blocked"],
    enabled: tab === "blocked",
    queryFn: () => listBlockedInventory(),
  });

  const runMut = useMutation({
    mutationFn: () => runStage4ComputeCosts({ data: {} }),
    onSuccess: (r) => {
      toast.success(`Stage 4: ${r.auto_applied} auto-applied, ${r.queued_for_review} queued, ${r.blocked} blocked`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "cost-queue"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const decideMut = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject" }) =>
      decideCostUpdate({ data: { queue_id: v.id, decision: v.decision } }),
    onSuccess: (_, v) => {
      toast.success(v.decision === "approve" ? "Approved & applied" : "Rejected");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "cost-queue"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const rows = useMemo(() => (queue.data?.rows ?? []) as any[], [queue.data]);
  const blockedItems = useMemo(() => (blocked.data?.items ?? []) as any[], [blocked.data]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Cost Update Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stage 4 — review proposed inventory cost updates. Auto-applied changes are logged for audit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["pricing-v2", "cost-queue"] })}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="w-4 h-4" /> {runMut.isPending ? "Running…" : "Run Stage 4 now"}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending review</TabsTrigger>
          <TabsTrigger value="auto_applied">Auto-applied</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="blocked">Blocked items</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {tab === "blocked" ? `${blockedItems.length} blocked items` : `${rows.length} entries`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tab === "blocked" ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Last approved</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Audit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedItems.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No blocked items 🎉
                        </TableCell></TableRow>
                      ) : blockedItems.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">{it.name}</TableCell>
                          <TableCell>{it.category ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCpg(it.last_approved_cost_per_gram)}</TableCell>
                          <TableCell><Badge variant="destructive">{it.pricing_status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => setAuditFor({ id: it.id, name: it.name })}>
                              <History className="w-3 h-3" /> History
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Old</TableHead>
                        <TableHead className="text-right">New</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Flags</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No entries
                        </TableCell></TableRow>
                      ) : rows.map((r) => {
                        const inv = r.inventory_items;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {inv?.name ?? r.inventory_item_id}
                              {inv?.category && <div className="text-xs text-muted-foreground">{inv.category}</div>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtCpg(r.old_cost_per_gram)}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{fmtCpg(r.new_computed_cost_per_gram)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtPct(r.pct_change)}</TableCell>
                            <TableCell>{srcBadge(r.resolution_source)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(r.warning_flags ?? []).map((f: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs gap-1">
                                    <AlertTriangle className="w-3 h-3" />{f}
                                  </Badge>
                                ))}
                                {r.signals_count > 0 && <Badge variant="outline" className="text-xs">{r.signals_count} signals</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost"
                                  onClick={() => setAuditFor({ id: r.inventory_item_id, name: inv?.name ?? "" })}>
                                  <History className="w-3 h-3" /> History
                                </Button>
                                {tab === "pending" && (
                                  <>
                                    <Button size="sm" variant="outline" disabled={decideMut.isPending}
                                      onClick={() => decideMut.mutate({ id: r.id, decision: "reject" })}>
                                      <XCircle className="w-3 h-3" /> Reject
                                    </Button>
                                    <Button size="sm" disabled={decideMut.isPending}
                                      onClick={() => decideMut.mutate({ id: r.id, decision: "approve" })}>
                                      <CheckCircle2 className="w-3 h-3" /> Approve
                                    </Button>
                                  </>
                                )}
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
      </Tabs>

      <AuditLogDialog
        item={auditFor}
        open={!!auditFor}
        onOpenChange={(v) => { if (!v) setAuditFor(null); }}
      />
    </div>
  );
}

function AuditLogDialog({
  item, open, onOpenChange,
}: {
  item: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const audit = useQuery({
    queryKey: ["pricing-v2", "audit-log", item?.id],
    enabled: !!item?.id,
    queryFn: () => getInventoryCostAuditLog({ data: { inventory_item_id: item!.id, limit: 100 } }),
  });
  const log = (audit.data?.log ?? []) as any[];
  const queue = (audit.data?.queue ?? []) as any[];
  const meta = audit.data?.item;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit log — {item?.name ?? "—"}</DialogTitle>
          <DialogDescription>
            All applied cost changes and review decisions for this inventory item.
          </DialogDescription>
        </DialogHeader>

        {meta && (
          <div className="grid grid-cols-3 gap-3 text-sm border rounded-md p-3 bg-muted/30">
            <div>
              <div className="text-xs text-muted-foreground">Current cost</div>
              <div className="font-semibold tabular-nums">{fmtCpg(meta.cost_per_gram_live)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last approved</div>
              <div className="font-semibold tabular-nums">{fmtCpg(meta.last_approved_cost_per_gram)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div><Badge variant={meta.pricing_status === "OK" ? "default" : "destructive"}>{meta.pricing_status}</Badge></div>
            </div>
          </div>
        )}

        <div>
          <div className="text-sm font-semibold mb-2">Applied changes ({log.length})</div>
          {audit.isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : log.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No applied changes yet.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead className="text-right">Old</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Via</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCpg(e.old_cost_per_gram)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtCpg(e.new_cost_per_gram)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(e.pct_change)}</TableCell>
                      <TableCell>{srcBadge(e.resolution_source)}</TableCell>
                      <TableCell><Badge variant={e.applied_via === "auto" ? "secondary" : "default"} className="text-xs">{e.applied_via}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[16rem] truncate">{e.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Queue history ({queue.length})</div>
          {queue.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No queue entries.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Old → New</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Decision notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(q.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={
                          q.status === "approved" || q.status === "auto_applied" ? "default"
                          : q.status === "rejected" ? "destructive" : "secondary"
                        } className="text-xs">{q.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {fmtCpg(q.old_cost_per_gram)} → <span className="font-semibold">{fmtCpg(q.new_computed_cost_per_gram)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(q.pct_change)}</TableCell>
                      <TableCell>{srcBadge(q.resolution_source)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[16rem] truncate">{q.decision_notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
