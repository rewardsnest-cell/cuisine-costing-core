// Pricing v2 — Stage 6: Menu Pricing page.
// Set/override multipliers (per-recipe and global default), preview resulting
// menu/quote prices live before applying, then commit selected overrides.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play, RefreshCw, Info, CheckCircle2, AlertTriangle, XCircle, Save, Eye, Undo2, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  runStage6MenuPricing,
  listMenuPrices,
  setRecipeMultiplierOverride,
} from "@/lib/server-fns/pricing-v2-stage6-menu.functions";
import {
  getPricingV2Settings,
  savePricingV2Settings,
} from "@/lib/server-fns/pricing-v2.functions";
import { ExplainPriceDrawer } from "@/components/admin/ExplainPriceDrawer";

export const Route = createFileRoute("/admin/pricing-v2/menu-prices")({
  head: () => ({ meta: [{ title: "Pricing v2 — Menu Pricing" }] }),
  component: MenuPricesPage,
});

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function statusBadge(s: string) {
  if (s === "OK") return <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />OK</Badge>;
  if (s === "WARNING") return <Badge variant="secondary" className="gap-1"><AlertTriangle className="w-3 h-3" />Warning</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Blocked</Badge>;
}
function previewPrice(cps: number | null | undefined, mult: number | null | undefined) {
  if (cps == null || mult == null || !Number.isFinite(Number(cps)) || !Number.isFinite(Number(mult))) return null;
  return Math.round(Number(cps) * Number(mult) * 100) / 100;
}
function pctDelta(oldP: number | null, newP: number | null) {
  if (oldP == null || newP == null || oldP === 0) return null;
  return ((newP - oldP) / oldP) * 100;
}

function MenuPricesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "OK" | "WARNING" | "BLOCKED">("all");
  const [explain, setExplain] = useState<{ id: string; name: string } | null>(null);
  // Per-recipe drafted multiplier overrides (preview-only until applied).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [defaultDraft, setDefaultDraft] = useState<string>("");

  const settingsQ = useQuery({
    queryKey: ["pricing-v2", "settings"],
    queryFn: () => getPricingV2Settings(),
  });
  const currentDefault = Number(settingsQ.data?.settings?.default_menu_multiplier ?? 3);

  const list = useQuery({
    queryKey: ["pricing-v2", "menu-prices", filter],
    queryFn: () => listMenuPrices({ data: { scope: "recipe_menu", status: filter, limit: 500 } }),
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
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const saveDefaultMut = useMutation({
    mutationFn: (m: number) => savePricingV2Settings({ data: { default_menu_multiplier: m } as any }),
    onSuccess: () => {
      toast.success("Default multiplier saved");
      setDefaultDraft("");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const rows = useMemo(() => {
    const r = (list.data?.rows ?? []) as any[];
    if (!search.trim()) return r;
    const q = search.trim().toLowerCase();
    return r.filter((x) => (x.recipes?.name ?? "").toLowerCase().includes(q));
  }, [list.data, search]);

  const draftedIds = useMemo(
    () => Object.keys(drafts).filter((id) => drafts[id] && drafts[id].trim() !== ""),
    [drafts],
  );

  // Summary for the "Pending preview" banner.
  const previewSummary = useMemo(() => {
    let count = 0, deltaSum = 0;
    for (const r of rows) {
      const draft = drafts[r.recipe_id];
      if (!draft) continue;
      const m = Number(draft);
      if (!Number.isFinite(m) || m <= 0) continue;
      const p = previewPrice(r.recipe_cost_per_serving, m);
      if (p != null && r.menu_price != null) { deltaSum += p - Number(r.menu_price); count++; }
    }
    return { count, deltaSum };
  }, [rows, drafts]);

  async function applySelected() {
    const ids = Array.from(selected).filter((id) => drafts[id]);
    if (!ids.length) { toast.error("No selected rows have a draft multiplier"); return; }
    let ok = 0, fail = 0;
    for (const id of ids) {
      const m = Number(drafts[id]);
      if (!Number.isFinite(m) || m <= 0) { fail++; continue; }
      try {
        await overrideMut.mutateAsync({ recipe_id: id, multiplier: m });
        ok++;
      } catch { fail++; }
    }
    setDrafts((s) => {
      const c = { ...s };
      for (const id of ids) delete c[id];
      return c;
    });
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["pricing-v2", "menu-prices"] });
    toast[fail ? "warning" : "success"](`Applied ${ok} override(s)${fail ? ` · ${fail} failed` : ""}`);
  }

  async function applyOne(recipeId: string, m: number) {
    if (!Number.isFinite(m) || m <= 0) { toast.error("Invalid multiplier"); return; }
    try {
      await overrideMut.mutateAsync({ recipe_id: recipeId, multiplier: m });
      setDrafts((s) => { const c = { ...s }; delete c[recipeId]; return c; });
      setSelected((s) => { const c = new Set(s); c.delete(recipeId); return c; });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "menu-prices"] });
      toast.success("Override applied");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  function toggleAll(checked: boolean) {
    if (!checked) { setSelected(new Set()); return; }
    setSelected(new Set(rows.map((r: any) => r.recipe_id)));
  }

  function bulkSetMultiplier(value: string) {
    if (!selected.size) { toast.error("Select rows first"); return; }
    setDrafts((s) => {
      const c = { ...s };
      for (const id of selected) c[id] = value;
      return c;
    });
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Menu Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stage 6 — menu price = cost/serving × multiplier. Draft overrides preview live; nothing is saved until you apply. Sent quotes stay frozen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => list.refetch()}><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="w-4 h-4" /> {runMut.isPending ? "Running…" : "Reprice all now"}
          </Button>
        </div>
      </div>

      {/* Global default multiplier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Global default multiplier
          </CardTitle>
          <CardDescription>
            Used for any recipe without an explicit override. Current: <span className="font-semibold">×{currentDefault.toFixed(2)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label htmlFor="def-mult" className="text-xs">New default</Label>
              <Input id="def-mult" type="number" step="0.1" min="0.1" max="20"
                placeholder={String(currentDefault)} className="h-9 w-32"
                value={defaultDraft}
                onChange={(e) => setDefaultDraft(e.target.value)} />
            </div>
            <Button
              disabled={!defaultDraft || saveDefaultMut.isPending}
              onClick={() => {
                const m = Number(defaultDraft);
                if (!Number.isFinite(m) || m <= 0) { toast.error("Invalid multiplier"); return; }
                saveDefaultMut.mutate(m);
              }}
            >
              <Save className="w-4 h-4" /> Save default
            </Button>
            <p className="text-xs text-muted-foreground">
              Saving the default does not retroactively reprice. Click "Reprice all now" after saving to refresh non-overridden recipes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview banner */}
      {draftedIds.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <Eye className="w-4 h-4 text-primary" />
              <span className="font-medium">{draftedIds.length} draft override(s)</span>
              <span className="text-muted-foreground">
                · projected impact across previewed rows: {previewSummary.deltaSum >= 0 ? "+" : ""}{fmtMoney(previewSummary.deltaSum)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDrafts({})}>
                <Undo2 className="w-4 h-4" /> Discard all drafts
              </Button>
              <Button size="sm" onClick={applySelected} disabled={!selected.size || overrideMut.isPending}>
                <Save className="w-4 h-4" /> Apply selected ({selected.size})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={filter} onValueChange={(v) => { setFilter(v as any); setSelected(new Set()); }}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="OK">OK</TabsTrigger>
            <TabsTrigger value="WARNING">Warning</TabsTrigger>
            <TabsTrigger value="BLOCKED">Blocked</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          placeholder="Search recipe…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-2 px-3 flex-wrap">
          <span className="text-sm">{selected.size} selected</span>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">Set multiplier for selected:</span>
          <Input type="number" step="0.1" min="0.1" max="50" placeholder="e.g. 3.0"
            className="h-8 w-24"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                bulkSetMultiplier((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }} />
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} recipes</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.length > 0 && selected.size === rows.length}
                      onCheckedChange={(c) => toggleAll(!!c)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Recipe</TableHead>
                  <TableHead className="text-right">Cost / serving</TableHead>
                  <TableHead className="text-right">Current ×</TableHead>
                  <TableHead className="text-right">Current price</TableHead>
                  <TableHead>Override ×</TableHead>
                  <TableHead className="text-right">Preview price</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No snapshots. Reprice to compute.
                  </TableCell></TableRow>
                ) : rows.map((r) => {
                  const recipeId = r.recipe_id as string;
                  const draft = drafts[recipeId] ?? "";
                  const draftNum = draft ? Number(draft) : NaN;
                  const draftValid = Number.isFinite(draftNum) && draftNum > 0;
                  const cps = r.recipe_cost_per_serving != null ? Number(r.recipe_cost_per_serving) : null;
                  const previewedPrice = draftValid ? previewPrice(cps, draftNum) : null;
                  const currentPrice = r.menu_price != null ? Number(r.menu_price) : null;
                  const delta = previewedPrice != null && currentPrice != null ? previewedPrice - currentPrice : null;
                  const deltaPct = pctDelta(currentPrice, previewedPrice);
                  const isSelected = selected.has(recipeId);
                  return (
                    <TableRow key={r.id} className={draft ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(c) => {
                            setSelected((s) => {
                              const n = new Set(s);
                              if (c) n.add(recipeId); else n.delete(recipeId);
                              return n;
                            });
                          }}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{r.recipes?.name ?? recipeId}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(cps)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ×{Number(r.multiplier).toFixed(2)}
                        <Badge variant="outline" className="ml-2 text-xs">{r.multiplier_source}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(currentPrice)}</TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.1" min="0.1" max="50"
                          placeholder={String(r.multiplier)}
                          className="h-8 w-20"
                          value={draft}
                          onChange={(e) => setDrafts((s) => ({ ...s, [recipeId]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {previewedPrice != null ? (
                          <span className="font-semibold text-primary">{fmtMoney(previewedPrice)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {delta != null ? (
                          <span className={delta >= 0 ? "text-emerald-600" : "text-red-600"}>
                            {delta >= 0 ? "+" : ""}{fmtMoney(delta)}
                            {deltaPct != null && (
                              <span className="text-xs ml-1 opacity-70">
                                ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {draft && (
                            <Button size="sm" variant="ghost"
                              onClick={() => setDrafts((s) => { const c = { ...s }; delete c[recipeId]; return c; })}
                              title="Discard draft">
                              <Undo2 className="w-3 h-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="default"
                            disabled={!draftValid || overrideMut.isPending}
                            onClick={() => applyOne(recipeId, draftNum)}
                            title="Apply this override">
                            <Save className="w-3 h-3" /> Apply
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => setExplain({ id: recipeId, name: r.recipes?.name ?? "" })}>
                            <Info className="w-3 h-3" /> Explain
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
  );
}
