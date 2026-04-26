// Pricing v2 — Stage 6: Menu Pricing page.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, RefreshCw, Info, CheckCircle2, AlertTriangle, XCircle, Save } from "lucide-react";
import { toast } from "sonner";
import {
  runStage6MenuPricing,
  listMenuPrices,
  setRecipeMultiplierOverride,
} from "@/lib/server-fns/pricing-v2-stage6-menu.functions";
import { ExplainPriceDrawer } from "@/components/admin/ExplainPriceDrawer";

export const Route = createFileRoute("/admin/pricing-v2/menu-prices")({
  head: () => ({ meta: [{ title: "Pricing v2 — Menu Pricing" }] }),
  component: MenuPricesPage,
});

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function statusBadge(s: string) {
  if (s === "OK") return <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />OK</Badge>;
  if (s === "WARNING") return <Badge variant="secondary" className="gap-1"><AlertTriangle className="w-3 h-3" />Warning</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Blocked</Badge>;
}

function MenuPricesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "OK" | "WARNING" | "BLOCKED">("all");
  const [explain, setExplain] = useState<{ id: string; name: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["pricing-v2", "menu-prices", filter],
    queryFn: () => listMenuPrices({ data: { scope: "recipe_menu", status: filter, limit: 300 } }),
  });

  const runMut = useMutation({
    mutationFn: () => runStage6MenuPricing({ data: { scope: "all" } }),
    onSuccess: (r) => {
      toast.success(`Stage 6: ${r.priced} priced · ${r.blocked} blocked`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "menu-prices"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const overrideMut = useMutation({
    mutationFn: (v: { recipe_id: string; multiplier: number }) =>
      setRecipeMultiplierOverride({ data: v }),
    onSuccess: (_, v) => {
      toast.success("Multiplier override saved");
      setOverrides((s) => { const c = { ...s }; delete c[v.recipe_id]; return c; });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "menu-prices"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const rows = useMemo(() => (list.data?.rows ?? []) as any[], [list.data]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Menu Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stage 6 — recipe menu prices = cost/serving × multiplier. Sent quotes stay frozen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => list.refetch()}><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="w-4 h-4" /> {runMut.isPending ? "Running…" : "Reprice all now"}
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="OK">OK</TabsTrigger>
          <TabsTrigger value="WARNING">Warning</TabsTrigger>
          <TabsTrigger value="BLOCKED">Blocked</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} recipes</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead>
                  <TableHead className="text-right">Cost / serving</TableHead>
                  <TableHead className="text-right">Multiplier</TableHead>
                  <TableHead className="text-right">Menu price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No snapshots. Reprice to compute.
                  </TableCell></TableRow>
                ) : rows.map((r) => {
                  const recipeId = r.recipe_id as string;
                  const value = overrides[recipeId] ?? "";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.recipes?.name ?? recipeId}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.recipe_cost_per_serving)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ×{Number(r.multiplier).toFixed(2)}
                        <Badge variant="outline" className="ml-2 text-xs">{r.multiplier_source}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.menu_price)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 items-center">
                          <Input
                            type="number" step="0.1" min="0.1" max="50"
                            placeholder={String(r.multiplier)}
                            className="h-8 w-20"
                            value={value}
                            onChange={(e) => setOverrides((s) => ({ ...s, [recipeId]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" disabled={!value || overrideMut.isPending}
                            onClick={() => {
                              const m = Number(value);
                              if (!Number.isFinite(m) || m <= 0) { toast.error("Invalid multiplier"); return; }
                              overrideMut.mutate({ recipe_id: recipeId, multiplier: m });
                            }}>
                            <Save className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline"
                          onClick={() => setExplain({ id: recipeId, name: r.recipes?.name ?? "" })}>
                          <Info className="w-3 h-3" /> Explain
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ExplainPriceDrawer
        recipeId={explain?.id ?? null}
        recipeName={explain?.name}
        open={!!explain}
        onOpenChange={(v) => { if (!v) setExplain(null); }}
      />
    </div>
  );
}
