// Pricing v2 — Stage 5: Recipe Costs page.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, RefreshCw, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  runStage5RecipeRollup,
  listRecipeCosts,
} from "@/lib/server-fns/pricing-v2-stage5-recipes.functions";
import { ExplainPriceDrawer } from "@/components/admin/ExplainPriceDrawer";

export const Route = createFileRoute("/admin/pricing-v2/recipe-costs")({
  head: () => ({ meta: [{ title: "Pricing v2 — Recipe Costs" }] }),
  component: RecipeCostsPage,
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

function RecipeCostsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "OK" | "WARNING" | "BLOCKED">("all");
  const [explain, setExplain] = useState<{ id: string; name: string } | null>(null);

  const list = useQuery({
    queryKey: ["pricing-v2", "recipe-costs", filter],
    queryFn: () => listRecipeCosts({ data: { status: filter, limit: 300 } }),
  });

  const runMut = useMutation({
    mutationFn: () => runStage5RecipeRollup({ data: {} }),
    onSuccess: (r) => {
      toast.success(`Stage 5: ${r.ok} OK · ${r.warning} warning · ${r.blocked} blocked`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "recipe-costs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const rows = useMemo(() => (list.data?.rows ?? []) as any[], [list.data]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Recipe Costs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stage 5 — current cost-per-serving snapshot for every active recipe (grams-only math).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => list.refetch()}><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="w-4 h-4" /> {runMut.isPending ? "Running…" : "Run Stage 5 now"}
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
                  <TableHead className="text-right">Servings</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                  <TableHead className="text-right">Cost / serving</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No snapshots. Run Stage 5 to compute.
                  </TableCell></TableRow>
                ) : rows.map((r) => {
                  const issues = [...(r.blocker_reasons ?? []), ...(r.warning_flags ?? [])];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.recipes?.name ?? r.recipe_id}
                        {r.recipes?.category && <div className="text-xs text-muted-foreground">{r.recipes.category}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.servings}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.total_cost)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.cost_per_serving)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        {issues.length === 0 ? <span className="text-muted-foreground text-xs">—</span> : (
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {issues.slice(0, 3).map((f: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                            ))}
                            {issues.length > 3 && <Badge variant="outline" className="text-xs">+{issues.length - 3}</Badge>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline"
                          onClick={() => setExplain({ id: r.recipe_id, name: r.recipes?.name ?? "" })}>
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
