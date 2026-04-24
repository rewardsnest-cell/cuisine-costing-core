import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Tag, ClipboardCheck, AlertTriangle, Pencil, Eye, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  listIngredientCosts,
  listCostUpdateQueue,
  approveCostUpdate,
  rejectCostUpdate,
  overrideCostUpdate,
} from "@/lib/server-fns/cost-intelligence.functions";
import { CostBreakdownPanel } from "@/components/admin/CostBreakdownPanel";

export const Route = createFileRoute("/admin/items")({
  head: () => ({ meta: [{ title: "Item & Cost Intelligence — Admin" }] }),
  component: ItemsPage,
});

type Item = Awaited<ReturnType<typeof listIngredientCosts>>[number];
type Pending = Awaited<ReturnType<typeof listCostUpdateQueue>>[number];

const CATEGORIES = ["all", "protein", "dairy", "dry", "produce", "other"] as const;

function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [it, p] = await Promise.all([
        listIngredientCosts({ data: { search: "", limit: 500 } }),
        listCostUpdateQueue({ data: { status: "pending" } }),
      ]);
      setItems(it);
      setPending(p);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const pendingByRef = useMemo(() => {
    const m = new Map<string, Pending>();
    for (const p of pending) m.set((p as any).reference_id, p);
    return m;
  }, [pending]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((i: any) => {
      if (s && !String(i.canonical_name).toLowerCase().includes(s)) return false;
      if (category !== "all") {
        const cat = String(i.category ?? "other").toLowerCase();
        if (cat !== category) return false;
      }
      return true;
    });
  }, [items, search, category]);

  const onApprove = async (id: string) => {
    setActing(id);
    try { await approveCostUpdate({ data: { queue_id: id } }); toast.success("Approved"); await load(); }
    catch (e: any) { toast.error(e?.message || "Approve failed"); }
    finally { setActing(null); }
  };
  const onReject = async (id: string) => {
    setActing(id);
    try { await rejectCostUpdate({ data: { queue_id: id } }); toast.success("Rejected"); await load(); }
    catch (e: any) { toast.error(e?.message || "Reject failed"); }
    finally { setActing(null); }
  };
  const onOverride = async (id: string) => {
    const v = window.prompt("Manual override unit cost:");
    if (!v) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) { toast.error("Invalid"); return; }
    setActing(id);
    try { await overrideCostUpdate({ data: { queue_id: id, manual_cost: n } }); toast.success("Override applied"); await load(); }
    catch (e: any) { toast.error(e?.message || "Override failed"); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Item &amp; Cost Intelligence</h1>
          <p className="text-sm text-muted-foreground">Internal Cost Intelligence — not customer-facing.</p>
        </div>
        <Link to="/admin/cost-queue">
          <Button variant="outline" className="gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Cost Update Queue
            {pending.length > 0 && <Badge variant="destructive" className="ml-1">{pending.length}</Badge>}
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by item name…" className="pl-8" />
            </div>
            <Select value={category} onValueChange={(v) => setCategory(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Kroger ingestion is managed via Admin → Pricing Intelligence → Kroger only.
                Do NOT add manual fetch / locationId controls here. */}
            <Link to="/admin/kroger-pricing">
              <Button variant="outline" className="gap-2"><Tag className="w-4 h-4" />View Kroger Pricing</Button>
            </Link>
            <div className="ml-auto text-xs text-muted-foreground">
              Showing {filtered.length} of {items.length}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="font-bold">Internal Estimate</TableHead>
                    <TableHead>Kroger</TableHead>
                    <TableHead>Manual</TableHead>
                    <TableHead>Historical</TableHead>
                    <TableHead>Δ%</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => {
                    const p = pendingByRef.get(r.id);
                    const pct = p ? Number(p.percent_change ?? 0) : null;
                    const hasManual = r.manual_unit_cost != null;
                    return (
                      <TableRow
                        key={r.id}
                        className={p ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.canonical_name}</span>
                            {hasManual && <Badge variant="outline" className="text-[10px] gap-1"><Wand2 className="w-3 h-3" />manual</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{r.category ?? "uncategorized"}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.default_unit}</TableCell>
                        <TableCell className="font-bold">
                          {r.internal_estimated_unit_cost != null ? `$${Number(r.internal_estimated_unit_cost).toFixed(4)}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.kroger_unit_cost != null ? `$${Number(r.kroger_unit_cost).toFixed(4)}` : "—"}</TableCell>
                        <TableCell className="text-sm">{r.manual_unit_cost != null ? `$${Number(r.manual_unit_cost).toFixed(4)}` : "—"}</TableCell>
                        <TableCell className="text-sm">{r.historical_avg_unit_cost != null ? `$${Number(r.historical_avg_unit_cost).toFixed(4)}` : "—"}</TableCell>
                        <TableCell>
                          {pct == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={Math.abs(pct) > 15 ? "destructive" : "secondary"}>
                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {p ? (
                            <Badge className="bg-amber-500/90 hover:bg-amber-500 text-white gap-1">
                              <AlertTriangle className="w-3 h-3" />Needs Review
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedRef(r.id)} className="gap-1">
                              <Eye className="w-3.5 h-3.5" />View
                            </Button>
                            {p && (
                              <>
                                <Button size="sm" variant="outline" disabled={acting === p.id} onClick={() => onApprove(p.id)}>Approve</Button>
                                <Button size="sm" variant="outline" disabled={acting === p.id} onClick={() => onOverride(p.id)} className="gap-1"><Pencil className="w-3 h-3" />Override</Button>
                                <Button size="sm" variant="ghost" disabled={acting === p.id} onClick={() => onReject(p.id)} className="text-destructive">Reject</Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No items match your filters.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription className="text-xs">
          /admin/items only reads and approves cost intelligence. It does not edit selling prices, modify menus, or affect quotes.
        </AlertDescription>
      </Alert>

      <Sheet open={!!selectedRef} onOpenChange={(o) => !o && setSelectedRef(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Item Detail</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selectedRef && <CostBreakdownPanel referenceId={selectedRef} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
