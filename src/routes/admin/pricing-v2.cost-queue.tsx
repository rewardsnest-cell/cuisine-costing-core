// Pricing v2 — Stage 4: Cost Update Approval Queue.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Play, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  runStage4ComputeCosts,
  listCostUpdateQueue,
  decideCostUpdate,
  listBlockedInventory,
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedItems.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No blocked items 🎉
                        </TableCell></TableRow>
                      ) : blockedItems.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">{it.name}</TableCell>
                          <TableCell>{it.category ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCpg(it.last_approved_cost_per_gram)}</TableCell>
                          <TableCell><Badge variant="destructive">{it.pricing_status}</Badge></TableCell>
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
                        {tab === "pending" && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={tab === "pending" ? 7 : 6} className="text-center text-muted-foreground py-8">
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
                            {tab === "pending" && (
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="outline" disabled={decideMut.isPending}
                                    onClick={() => decideMut.mutate({ id: r.id, decision: "reject" })}>
                                    <XCircle className="w-3 h-3" /> Reject
                                  </Button>
                                  <Button size="sm" disabled={decideMut.isPending}
                                    onClick={() => decideMut.mutate({ id: r.id, decision: "approve" })}>
                                    <CheckCircle2 className="w-3 h-3" /> Approve
                                  </Button>
                                </div>
                              </TableCell>
                            )}
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
    </div>
  );
}
