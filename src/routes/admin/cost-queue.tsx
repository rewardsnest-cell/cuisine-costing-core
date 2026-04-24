import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ShieldAlert, Check, X, Pencil, Info, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  listCostUpdateQueue,
  approveCostUpdate,
  rejectCostUpdate,
  overrideCostUpdate,
  bulkApproveCostUpdates,
  bulkRejectCostUpdates,
  listIngredientCosts,
} from "@/lib/server-fns/cost-intelligence.functions";
import { CostBreakdownPanel } from "@/components/admin/CostBreakdownPanel";

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
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" />Pending approval</CardTitle></CardHeader>
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
                            <TableCell className="font-medium">{r.ingredient_reference?.canonical_name ?? r.reference_id} <span className="text-xs text-muted-foreground">/ {r.ingredient_reference?.default_unit}</span></TableCell>
                            <TableCell>${Number(r.current_cost ?? 0).toFixed(4)}</TableCell>
                            <TableCell>${Number(r.proposed_cost ?? 0).toFixed(4)}</TableCell>
                            <TableCell><Badge variant={Math.abs(pct) > 15 ? "destructive" : "secondary"}>{direction}{pct.toFixed(2)}%</Badge></TableCell>
                            <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
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
              <CardTitle className="text-base">Item cost intelligence</CardTitle>
              <div className="flex gap-2 pt-2">
                <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
                <Button variant="outline" onClick={load}>Search</Button>
              </div>
            </CardHeader>
            <CardContent>
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
