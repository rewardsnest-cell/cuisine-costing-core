// Explain Price drawer — shows the full pricing chain for a recipe:
// Stage 5 ingredient breakdown + Stage 6 multiplier → menu price.
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRecipeCostExplanation } from "@/lib/server-fns/pricing-v2-stage5-recipes.functions";
import { listMenuPrices } from "@/lib/server-fns/pricing-v2-stage6-menu.functions";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

function statusBadge(status?: string | null) {
  if (status === "OK") return <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />OK</Badge>;
  if (status === "WARNING") return <Badge variant="secondary" className="gap-1"><AlertTriangle className="w-3 h-3" />Warning</Badge>;
  if (status === "BLOCKED") return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Blocked</Badge>;
  return <Badge variant="outline">{status ?? "—"}</Badge>;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function fmtCpg(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(5)}/g`;
}

export function ExplainPriceDrawer({
  recipeId,
  recipeName,
  open,
  onOpenChange,
}: {
  recipeId: string | null;
  recipeName?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const explain = useQuery({
    queryKey: ["pricing-v2", "explain", recipeId],
    enabled: !!recipeId && open,
    queryFn: () => getRecipeCostExplanation({ data: { recipe_id: recipeId! } }),
  });
  const menu = useQuery({
    queryKey: ["pricing-v2", "explain-menu", recipeId],
    enabled: !!recipeId && open,
    queryFn: () => listMenuPrices({ data: { scope: "recipe_menu", status: "all", limit: 50 } }),
  });

  const snap = explain.data?.snapshot as any;
  const breakdown = (snap?.ingredient_breakdown ?? []) as any[];
  const menuRow = (menu.data?.rows ?? []).find((r: any) => r.recipe_id === recipeId) as any;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Explain Price{recipeName ? ` — ${recipeName}` : ""}</SheetTitle>
          <SheetDescription>
            Full chain from ingredient costs (Stage 5) through menu multiplier (Stage 6).
          </SheetDescription>
        </SheetHeader>

        {explain.isLoading ? (
          <div className="text-sm text-muted-foreground py-8">Loading…</div>
        ) : !snap ? (
          <div className="text-sm text-muted-foreground py-8">
            No current cost snapshot. Run Stage 5 (recipe rollups) first.
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Status</span>{statusBadge(snap.status)}</div>
              <div className="flex justify-between"><span>Servings</span><span>{snap.servings}</span></div>
              <div className="flex justify-between"><span>Total cost</span><span>{fmtMoney(snap.total_cost)}</span></div>
              <div className="flex justify-between font-semibold"><span>Cost per serving</span><span>{fmtMoney(snap.cost_per_serving)}</span></div>
              {Array.isArray(snap.blocker_reasons) && snap.blocker_reasons.length > 0 && (
                <div className="text-destructive text-xs pt-1">
                  Blockers: {snap.blocker_reasons.join(", ")}
                </div>
              )}
              {Array.isArray(snap.warning_flags) && snap.warning_flags.length > 0 && (
                <div className="text-amber-600 text-xs pt-1">
                  Warnings: {snap.warning_flags.join(", ")}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Ingredient breakdown</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="text-right">Grams</TableHead>
                      <TableHead className="text-right">Cost/g</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No ingredients</TableCell></TableRow>
                    ) : breakdown.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {b.name}
                          {b.inventory_name && b.inventory_name !== b.name && (
                            <div className="text-xs text-muted-foreground">→ {b.inventory_name}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{b.grams ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCpg(b.cost_per_gram)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(b.ingredient_cost)}</TableCell>
                        <TableCell>
                          <Badge variant={b.status === "BLOCKED" ? "destructive" : b.status === "WARNING" ? "secondary" : "outline"} className="text-xs">
                            {b.source}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Menu pricing (Stage 6)</h3>
              {menuRow ? (
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Cost / serving</span><span>{fmtMoney(menuRow.recipe_cost_per_serving)}</span></div>
                  <div className="flex justify-between"><span>Multiplier</span><span>×{Number(menuRow.multiplier).toFixed(2)} <Badge variant="outline" className="ml-2 text-xs">{menuRow.multiplier_source}</Badge></span></div>
                  <div className="flex justify-between font-semibold text-base"><span>Menu price</span><span>{fmtMoney(menuRow.menu_price)}</span></div>
                  <div className="flex justify-between"><span>Status</span>{statusBadge(menuRow.status)}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No current menu price snapshot. Run Stage 6.</div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
