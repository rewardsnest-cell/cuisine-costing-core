// Pricing v2 — Stage 5: Recipe Costs page.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, RefreshCw, Info, CheckCircle2, AlertTriangle, XCircle, ListRestart } from "lucide-react";
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

function humanizeReason(code: string): string {
  const [type, detail] = code.split(":");
  switch (type) {
    case "NO_INGREDIENTS": return "Recipe has no ingredients";
    case "ZERO_OR_NEGATIVE_GRAMS": return `Missing/zero grams: ${detail ?? ""}`;
    case "MISSING_INGREDIENT_COST": return `Missing inventory cost: ${detail ?? ""}`;
    case "DEGRADED_INGREDIENT": return `Using fallback cost: ${detail ?? ""}`;
    default: return code;
  }
}

function RecipeCostsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "OK" | "WARNING" | "BLOCKED">("all");
  const [explain, setExplain] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const list = useQuery({
    queryKey: ["pricing-v2", "recipe-costs", filter],
    queryFn: () => listRecipeCosts({ data: { status: filter, limit: 300 } }),
  });

  const runMut = useMutation({
    mutationFn: (recipe_ids?: string[]) =>
      runStage5RecipeRollup({ data: recipe_ids?.length ? { recipe_ids } : {} }),
    onSuccess: (r) => {
      toast.success(`Stage 5: ${r.ok} OK · ${r.warning} warning · ${r.blocked} blocked`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["pricing-v2", "recipe-costs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const allRows = useMemo(() => (list.data?.rows ?? []) as any[], [list.data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => (r.recipes?.name ?? "").toLowerCase().includes(q));
  }, [allRows, search]);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.recipe_id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) rows.forEach((r) => next.delete(r.recipe_id));
    else rows.forEach((r) => next.add(r.recipe_id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold">Recipe Costs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Stage 5 — current cost-per-serving snapshot for every active recipe (grams-only math).
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => list.refetch()}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button
              variant="secondary"
              disabled={selected.size === 0 || runMut.isPending}
              onClick={() => runMut.mutate(Array.from(selected))}
            >
              <ListRestart className="w-4 h-4" />
              {runMut.isPending && selected.size > 0 ? "Re-running…" : `Re-run selected (${selected.size})`}
            </Button>
            <Button onClick={() => runMut.mutate(undefined)} disabled={runMut.isPending}>
              <Play className="w-4 h-4" /> {runMut.isPending && selected.size === 0 ? "Running…" : "Run all now"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="OK">OK</TabsTrigger>
              <TabsTrigger value="WARNING">Warning</TabsTrigger>
              <TabsTrigger value="BLOCKED">Blocked</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {rows.length} recipes{selected.size > 0 ? ` · ${selected.size} selected` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all visible"
                      />
                    </TableHead>
                    <TableHead>Recipe</TableHead>
                    <TableHead className="text-right">Servings</TableHead>
                    <TableHead className="text-right">Total cost</TableHead>
                    <TableHead className="text-right">Cost / serving</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No snapshots. Run Stage 5 to compute.
                    </TableCell></TableRow>
                  ) : rows.map((r) => {
                    const blockers: string[] = r.blocker_reasons ?? [];
                    const warns: string[] = r.warning_flags ?? [];
                    const issues = [...blockers, ...warns];
                    const isSelected = selected.has(r.recipe_id);
                    return (
                      <TableRow key={r.id} data-state={isSelected ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(r.recipe_id)}
                            aria-label={`Select ${r.recipes?.name ?? r.recipe_id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.recipes?.name ?? r.recipe_id}
                          {r.recipes?.category && <div className="text-xs text-muted-foreground">{r.recipes.category}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.servings}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(r.total_cost)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.cost_per_serving)}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell>
                          {issues.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-wrap gap-1 max-w-md cursor-help">
                                  {issues.slice(0, 2).map((f, i) => (
                                    <Badge
                                      key={i}
                                      variant={blockers.includes(f) ? "destructive" : "outline"}
                                      className="text-xs"
                                    >
                                      {humanizeReason(f)}
                                    </Badge>
                                  ))}
                                  {issues.length > 2 && <Badge variant="outline" className="text-xs">+{issues.length - 2}</Badge>}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <ul className="space-y-1 text-xs">
                                  {issues.map((f, i) => (
                                    <li key={i}>
                                      <span className={blockers.includes(f) ? "text-destructive font-medium" : ""}>
                                        {blockers.includes(f) ? "Blocker" : "Warning"}:
                                      </span>{" "}
                                      {humanizeReason(f)}
                                    </li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline"
                              onClick={() => setExplain({ id: r.recipe_id, name: r.recipes?.name ?? "" })}>
                              <Info className="w-3 h-3" /> Explain
                            </Button>
                            <Button size="sm" variant="ghost"
                              disabled={runMut.isPending}
                              onClick={() => runMut.mutate([r.recipe_id])}>
                              <RefreshCw className="w-3 h-3" /> Re-run
                            </Button>
                          </div>
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
    </TooltipProvider>
  );
}
