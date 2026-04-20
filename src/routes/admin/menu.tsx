import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, ChefHat, ImageOff, Sparkles, Loader2, RefreshCw, ExternalLink, Link2, Check, LayoutGrid, Table as TableIcon, Database, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { generateRecipePhoto } from "@/lib/server/generate-recipe-photos";
import { bulkRefreshRecipesFromFred } from "@/lib/server-fns/bulk-refresh-fred.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/menu")({
  head: () => ({
    meta: [{ title: "Public Menu — Admin" }],
  }),
  component: AdminMenuPage,
});

type MenuRecipe = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  cost_per_serving: number | null;
  menu_price: number | null;
  active: boolean;
  is_standard: boolean;
  is_premium: boolean;
  markup_percentage: number | null;
  selling_price_per_person: number | null;
};

const DEFAULT_MARKUP = 3.5;

function resolvedPrice(r: Pick<MenuRecipe, "menu_price" | "cost_per_serving" | "selling_price_per_person">) {
  if (r.menu_price != null && Number(r.menu_price) > 0) return Number(r.menu_price);
  if (r.selling_price_per_person != null && Number(r.selling_price_per_person) > 0) return Number(r.selling_price_per_person);
  return Number(r.cost_per_serving || 0) * DEFAULT_MARKUP;
}

type SortKey = "name" | "category" | "cost" | "price" | "markup" | "active";

function AdminMenuPage() {
  const [recipes, setRecipes] = useState<MenuRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [markupDrafts, setMarkupDrafts] = useState<Record<string, string>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string }>({
    done: 0,
    total: 0,
    current: "",
  });
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [refreshingFred, setRefreshingFred] = useState(false);
  const genPhoto = useServerFn(generateRecipePhoto);
  const bulkFred = useServerFn(bulkRefreshRecipesFromFred);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("recipes")
      .select("id, name, description, category, image_url, cost_per_serving, menu_price, active, is_standard, is_premium, markup_percentage, selling_price_per_person")
      .order("name");
    if (error) {
      toast.error(error.message);
    } else {
      setRecipes((data || []) as MenuRecipe[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [recipes, search],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (r: MenuRecipe): string | number => {
      switch (sortKey) {
        case "name": return r.name.toLowerCase();
        case "category": return (r.category || "").toLowerCase();
        case "cost": return Number(r.cost_per_serving || 0);
        case "price": return resolvedPrice(r);
        case "markup": return Number(r.markup_percentage || 0);
        case "active": return r.active ? 0 : 1;
        default: return 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const updateRecipe = async (id: string, patch: Partial<MenuRecipe>) => {
    setSavingId(id);
    setRecipes((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("recipes").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const commitPrice = async (id: string) => {
    const raw = priceDrafts[id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (Number.isNaN(next as number) || (next as number) < 0)) {
      toast.error("Enter a valid non-negative price, or leave blank for auto.");
      return;
    }
    await updateRecipe(id, { menu_price: next as any });
    setPriceDrafts((d) => { const { [id]: _, ...rest } = d; return rest; });
  };

  const commitMarkup = async (id: string) => {
    const raw = markupDrafts[id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (Number.isNaN(next as number) || (next as number) < 0 || (next as number) > 1000)) {
      toast.error("Enter a markup percentage between 0 and 1000, or leave blank for default.");
      return;
    }
    await updateRecipe(id, { markup_percentage: next as any });
    setMarkupDrafts((d) => { const { [id]: _, ...rest } = d; return rest; });
  };

  const generateOne = async (id: string) => {
    setGeneratingId(id);
    try {
      const res = await genPhoto({ data: { recipeId: id } });
      setRecipes((cur) => cur.map((r) => (r.id === id ? { ...r, image_url: res.url } : r)));
      toast.success(`Generated photo for ${res.name}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate photo");
    } finally {
      setGeneratingId(null);
    }
  };

  const generateMissing = async () => {
    const missing = recipes.filter((r) => !r.image_url);
    if (missing.length === 0) {
      toast.info("All recipes already have photos.");
      return;
    }
    if (!confirm(`Generate AI photos for ${missing.length} recipe${missing.length === 1 ? "" : "s"}? This may take a few minutes.`)) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: missing.length, current: "" });
    let ok = 0, fail = 0;
    const CONCURRENCY = 3;
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      const batch = missing.slice(i, i + CONCURRENCY);
      setBulkProgress({ done: i, total: missing.length, current: batch.map((r) => r.name).join(", ") });
      const results = await Promise.allSettled(
        batch.map(async (r) => {
          const res = await genPhoto({ data: { recipeId: r.id } });
          return { id: r.id, name: r.name, url: res.url };
        })
      );
      results.forEach((result, idx) => {
        const r = batch[idx];
        if (result.status === "fulfilled") {
          const { id, url } = result.value;
          setRecipes((cur) => cur.map((x) => (x.id === id ? { ...x, image_url: url } : x)));
          ok++;
        } else {
          console.error("Photo gen failed for", r.name, result.reason);
          fail++;
        }
      });
    }
    setBulkProgress({ done: missing.length, total: missing.length, current: "" });
    setBulkRunning(false);
    if (fail === 0) toast.success(`Generated ${ok} photo${ok === 1 ? "" : "s"}.`);
    else toast.warning(`Generated ${ok}, failed ${fail}. Check console for details.`);
  };

  const refreshFromFred = async () => {
    const ids = filtered.filter((r) => r.active).map((r) => r.id);
    if (ids.length === 0) {
      toast.info("No active recipes in current filter.");
      return;
    }
    if (!confirm(`Refresh costs from FRED for ${ids.length} active recipe${ids.length === 1 ? "" : "s"}? This pulls the latest prices and recomputes recipe costs.`)) return;
    setRefreshingFred(true);
    try {
      const res = await bulkFred({ data: { recipe_ids: ids } });
      const parts: string[] = [];
      if (res.items_refreshed) parts.push(`${res.items_refreshed} ingredient${res.items_refreshed === 1 ? "" : "s"} updated`);
      if (res.recipes_recomputed) parts.push(`${res.recipes_recomputed} recipe${res.recipes_recomputed === 1 ? "" : "s"} recosted`);
      toast.success(parts.length ? `FRED refresh complete — ${parts.join(", ")}` : "FRED refresh complete");
      if (res.errors.length) toast.warning(`${res.errors.length} item${res.errors.length === 1 ? "" : "s"} failed`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Bulk refresh failed");
    } finally {
      setRefreshingFred(false);
    }
  };

  const missingCount = recipes.filter((r) => !r.image_url).length;

  const turnAllOff = async () => {
    const targets = filtered.filter((r) => r.active);
    if (targets.length === 0) { toast.info("No recipes are currently shown on the menu."); return; }
    const scope = search.trim() ? `${targets.length} filtered recipe${targets.length === 1 ? "" : "s"}` : `all ${targets.length} recipe${targets.length === 1 ? "" : "s"}`;
    if (!confirm(`Hide ${scope} from the public menu?`)) return;
    const ids = targets.map((r) => r.id);
    setRecipes((cur) => cur.map((r) => (ids.includes(r.id) ? { ...r, active: false } : r)));
    const { error } = await (supabase as any).from("recipes").update({ active: false }).in("id", ids);
    if (error) { toast.error(error.message); load(); }
    else { toast.success(`Hid ${targets.length} recipe${targets.length === 1 ? "" : "s"} from the menu.`); }
  };

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/menu" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Public Menu</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control which recipes appear on the public menu, set per-person prices and markup, and bulk-refresh costs from FRED.
            Price falls back to <span className="font-medium">cost × {DEFAULT_MARKUP}</span> when blank.
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setView("cards")}
            className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${view === "cards" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Cards
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${view === "table" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            <TableIcon className="w-3.5 h-3.5" /> Table
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search recipes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button
          onClick={refreshFromFred}
          disabled={refreshingFred || loading}
          className="gap-2 bg-gradient-warm text-primary-foreground"
        >
          {refreshingFred ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {refreshingFred ? "Refreshing…" : `Refresh ${filtered.filter((r) => r.active).length} from FRED`}
        </Button>
        <Button onClick={generateMissing} disabled={bulkRunning || loading || missingCount === 0} variant="outline" className="gap-2">
          {bulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {bulkRunning
            ? `Generating ${bulkProgress.done}/${bulkProgress.total}…`
            : missingCount === 0
              ? "All photos generated"
              : `Generate ${missingCount} missing photo${missingCount === 1 ? "" : "s"}`}
        </Button>
        <Button onClick={turnAllOff} disabled={loading || filtered.every((r) => !r.active)} variant="outline" className="gap-2">
          Turn all off{search.trim() ? " (filtered)" : ""}
        </Button>
      </div>
      {bulkRunning && bulkProgress.current && (
        <p className="text-xs text-muted-foreground -mt-3">Current: {bulkProgress.current}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading recipes…</p>
      ) : sorted.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <ChefHat className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No recipes found.</p>
          </CardContent>
        </Card>
      ) : view === "table" ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTh label="Recipe" k="name" sortKey={sortKey} sortDir={sortDir} toggle={toggleSort} />
                  <SortableTh label="Category" k="category" sortKey={sortKey} sortDir={sortDir} toggle={toggleSort} />
                  <SortableTh label="Cost / serving" k="cost" sortKey={sortKey} sortDir={sortDir} toggle={toggleSort} align="right" />
                  <SortableTh label="Markup %" k="markup" sortKey={sortKey} sortDir={sortDir} toggle={toggleSort} align="right" />
                  <SortableTh label="Price / person" k="price" sortKey={sortKey} sortDir={sortDir} toggle={toggleSort} align="right" />
                  <SortableTh label="Visible" k="active" sortKey={sortKey} sortDir={sortDir} toggle={toggleSort} align="center" />
                  <TableHead>Tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => {
                  const auto = Number(r.cost_per_serving || 0) * DEFAULT_MARKUP;
                  const effective = resolvedPrice(r);
                  const priceDraft = priceDrafts[r.id];
                  const markupDraft = markupDrafts[r.id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.category || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(r.cost_per_serving || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          inputMode="decimal"
                          placeholder="default"
                          value={markupDraft !== undefined ? markupDraft : (r.markup_percentage != null ? String(r.markup_percentage) : "")}
                          onChange={(e) => setMarkupDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          onBlur={() => markupDraft !== undefined && commitMarkup(r.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="h-8 w-20 text-right text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-muted-foreground text-xs">$</span>
                          <Input
                            inputMode="decimal"
                            placeholder={`Auto: ${auto.toFixed(2)}`}
                            value={priceDraft !== undefined ? priceDraft : (r.menu_price != null ? String(r.menu_price) : "")}
                            onChange={(e) => setPriceDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                            onBlur={() => priceDraft !== undefined && commitPrice(r.id)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-8 w-24 text-right text-xs"
                          />
                          <span className="font-display font-bold text-gradient-gold tabular-nums w-14 text-right">${effective.toFixed(2)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={r.active}
                          onCheckedChange={(v) => updateRecipe(r.id, { active: v })}
                          disabled={savingId === r.id}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-xs">
                            <Switch checked={r.is_standard} onCheckedChange={(v) => updateRecipe(r.id, { is_standard: v })} disabled={savingId === r.id} />
                            <span className="text-muted-foreground">Std</span>
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs">
                            <Switch checked={r.is_premium} onCheckedChange={(v) => updateRecipe(r.id, { is_premium: v })} disabled={savingId === r.id} />
                            <span className="text-muted-foreground">Prem</span>
                          </label>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((r) => {
            const auto = Number(r.cost_per_serving || 0) * DEFAULT_MARKUP;
            const effective = resolvedPrice(r);
            const draft = priceDrafts[r.id];
            const priceValue = draft !== undefined ? draft : (r.menu_price != null ? String(r.menu_price) : "");
            return (
              <Card key={r.id} className="shadow-warm border-border/50 overflow-hidden">
                <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden relative group">
                  {r.image_url ? (
                    <>
                      <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2 gap-1.5 h-7 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-md"
                        disabled={generatingId === r.id || bulkRunning}
                        onClick={() => {
                          if (confirm(`Regenerate AI photo for "${r.name}"? This will replace the current image.`)) generateOne(r.id);
                        }}
                        title="Regenerate photo"
                      >
                        {generatingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {generatingId === r.id ? "Regenerating…" : "Regenerate"}
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground/60 gap-2">
                      <ImageOff className="w-8 h-8" />
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-xs"
                        disabled={generatingId === r.id || bulkRunning}
                        onClick={() => generateOne(r.id)}
                      >
                        {generatingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {generatingId === r.id ? "Generating…" : "Generate photo"}
                      </Button>
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-semibold leading-tight">{r.name}</h3>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="font-display text-lg font-bold text-gradient-gold">${effective.toFixed(2)}</span>
                        <span className="text-[10px] text-muted-foreground">/person</span>
                      </div>
                    </div>
                    {r.category && <p className="text-xs text-muted-foreground mt-0.5">{r.category}</p>}
                    {r.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{r.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={`/menu#recipe-${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        title="Open this recipe on the public menu in a new tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Preview on /menu
                      </a>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs gap-1.5"
                        onClick={() => {
                          const url = `${window.location.origin}/menu#recipe-${r.id}`;
                          navigator.clipboard.writeText(url);
                          setCopiedId(r.id);
                          toast.success("Link copied to clipboard");
                          setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 1500);
                        }}
                      >
                        {copiedId === r.id ? (<><Check className="w-3 h-3 text-green-500" />Copied</>) : (<><Link2 className="w-3 h-3" />Copy link</>)}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`price-${r.id}`} className="text-xs">Menu price (per person)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id={`price-${r.id}`}
                          inputMode="decimal"
                          placeholder={`Auto: ${auto.toFixed(2)}`}
                          value={priceValue}
                          onChange={(e) => setPriceDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          onBlur={() => draft !== undefined && commitPrice(r.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="pl-7"
                        />
                      </div>
                      {draft !== undefined && <span className="text-[10px] text-muted-foreground">unsaved</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Leave blank to use auto price (cost × {DEFAULT_MARKUP}).</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                    <ToggleRow label="Show on menu" checked={r.active} onChange={(v) => updateRecipe(r.id, { active: v })} disabled={savingId === r.id} />
                    <ToggleRow label="Standard" checked={r.is_standard} onChange={(v) => updateRecipe(r.id, { is_standard: v })} disabled={savingId === r.id} />
                    <ToggleRow label="Premium" checked={r.is_premium} onChange={(v) => updateRecipe(r.id, { is_premium: v })} disabled={savingId === r.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableTh({ label, k, sortKey, sortDir, toggle, align }: { label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; toggle: (k: SortKey) => void; align?: "right" | "center" }) {
  const active = sortKey === k;
  return (
    <TableHead className={align === "right" ? "text-right" : align === "center" ? "text-center" : ""}>
      <button onClick={() => toggle(k)} className={`inline-flex items-center gap-1 hover:text-foreground transition ${active ? "text-foreground font-semibold" : ""}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1 rounded-md bg-muted/30">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
