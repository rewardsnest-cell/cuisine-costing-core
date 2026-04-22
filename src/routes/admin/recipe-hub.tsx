import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChefHat, Video, ShoppingBag, Search, Plus, Pencil, RefreshCw, Sparkles, Loader2, X, ImageOff } from "lucide-react";
import { parseYouTubeId } from "@/lib/recipe-video";
import { RecipeBulkActions } from "@/components/admin/RecipeBulkActions";
import { Checkbox } from "@/components/ui/checkbox";
import { isCocktail } from "@/lib/recipe-kind";
import { getIngredientCostMetrics } from "@/lib/recipe-costing";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { generateRecipePhoto } from "@/lib/server/generate-recipe-photos";

import { PageHelpCard } from "@/components/admin/PageHelpCard";
import {
  HEALTH_BADGE_CLASS,
  HEALTH_LABEL,
  HEALTH_SORT_RANK,
  type HealthStatus,
  type RecipeHealthSummaryRow,
} from "@/lib/pricing-health";

export const Route = createFileRoute("/admin/recipe-hub")({
  head: () => ({ meta: [{ title: "Recipes — Admin" }] }),
  component: RecipeHub,
});

type Row = {
  id: string;
  name: string;
  active: boolean;
  category: string | null;
  use_case: string | null;
  image_url: string | null;
  video_url: string | null;
  pro_tips: any;
  cost_per_serving: number | null;
  score_affiliate: number;
  score_video: number;
  score_event: number;
  score_seasonal: number;
  pricing_status: string | null;
  pricing_errors: any;
  shop_count?: number;
  health_status?: HealthStatus;
  stale_count?: number;
};

type ContentFilter = "all" | "no-video" | "no-shop" | "no-photo" | "draft";
type StatusFilter = "all" | "active" | "off";
type Kind = "all" | "food" | "cocktail";
type HealthFilter = "all" | "blocked" | "warning" | "healthy";

function RecipeHub() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ContentFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recomputingAll, setRecomputingAll] = useState(false);
  const [bulkGen, setBulkGen] = useState<{ running: boolean; done: number; total: number; failed: number; queue: string[] }>({
    running: false, done: 0, total: 0, failed: 0, queue: [],
  });
  const cancelRef = useRef(false);
  const runningRef = useRef(false);
  const askConfirm = useConfirm();
  const genPhoto = useServerFn(generateRecipePhoto);

  // Warn on tab close while bulk is running
  useEffect(() => {
    if (!bulkGen.running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [bulkGen.running]);

  const toggleSelect = (id: string) =>
    setSelectedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const load = async () => {
    setLoading(true);
    const [{ data: recipes }, { data: shop }] = await Promise.all([
      (supabase as any)
        .from("recipes")
        .select("id, name, active, category, use_case, image_url, video_url, pro_tips, cost_per_serving, score_affiliate, score_video, score_event, score_seasonal, pricing_status, pricing_errors")
        .order("updated_at", { ascending: false }),
      (supabase as any).from("recipe_shop_items").select("recipe_id"),
    ]);
    const counts = new Map<string, number>();
    for (const s of (shop || []) as any[]) counts.set(s.recipe_id, (counts.get(s.recipe_id) || 0) + 1);
    const merged: Row[] = (recipes || []).map((r: any) => ({ ...r, shop_count: counts.get(r.id) || 0 }));
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const withVideo = rows.filter((r) => parseYouTubeId(r.video_url)).length;
    const withShop = rows.filter((r) => (r.shop_count || 0) > 0).length;
    const withPhoto = rows.filter((r) => !!r.image_url).length;
    const drafts = rows.filter((r) => !r.active).length;
    return { total, withVideo, withShop, withPhoto, drafts };
  }, [rows]);

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !r.name.toLowerCase().includes(ql)) return false;
      if (filter === "no-video" && parseYouTubeId(r.video_url)) return false;
      if (filter === "no-shop" && (r.shop_count || 0) > 0) return false;
      if (filter === "no-photo" && r.image_url) return false;
      if (filter === "draft" && r.active) return false;
      if (status === "active" && !r.active) return false;
      if (status === "off" && r.active) return false;
      if (kind === "food" && isCocktail(r.category)) return false;
      if (kind === "cocktail" && !isCocktail(r.category)) return false;
      return true;
    });
  }, [rows, q, filter, status, kind]);

  // All recipes lacking a photo (entire dataset, not just visible)
  const allMissingPhoto = useMemo(() => rows.filter((r) => !r.image_url), [rows]);

  const recomputeAllCosts = async () => {
    if (recomputingAll) return;
    const ok = await askConfirm({
      title: "Recompute all recipe costs?",
      description: "Recomputes costs for every recipe using the latest inventory prices.",
    });
    if (!ok) return;
    setRecomputingAll(true);
    const toastId = toast.loading("Recomputing all recipe costs…");
    try {
      const { data, error } = await (supabase as any)
        .from("recipes")
        .select(
          "id, servings, recipe_ingredients(quantity, unit, cost_per_unit, inventory_item:inventory_items(name, average_cost_per_unit, unit))",
        );
      if (error) throw error;

      let updated = 0;
      let failed = 0;
      for (const r of (data || []) as any[]) {
        const total = (r.recipe_ingredients || []).reduce(
          (sum: number, ing: any) =>
            sum +
            getIngredientCostMetrics({
              quantity: Number(ing.quantity) || 0,
              unit: ing.unit,
              fallbackCostPerUnit: ing.cost_per_unit,
              inventoryItem: ing.inventory_item,
            }).lineTotal,
          0,
        );
        const servings = Math.max(1, Number(r.servings) || 1);
        const perServing = total / servings;
        const { error: upErr } = await (supabase as any)
          .from("recipes")
          .update({
            total_cost: Math.round(total * 10000) / 10000,
            cost_per_serving: Math.round(perServing * 10000) / 10000,
          })
          .eq("id", r.id);
        if (upErr) failed++;
        else updated++;
      }
      await load();
      toast.success(
        failed > 0 ? `Recomputed ${updated} recipes (${failed} failed)` : `Recomputed ${updated} recipes`,
        { id: toastId },
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to recompute costs", { id: toastId });
    } finally {
      setRecomputingAll(false);
    }
  };

  // ---- Bulk image generation: resilient runner ----
  const STORAGE_KEY = "recipeHub.bulkPhotoQueue.v1";
  const PER_CALL_TIMEOUT_MS = 60_000;

  const persistQueue = (queue: string[], done: number, failed: number, total: number) => {
    try {
      if (queue.length === 0 && !runningRef.current) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, done, failed, total }));
      }
    } catch {}
  };

  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });

  const runQueue = async (initialQueue: string[], initialDone = 0, initialFailed = 0, initialTotal?: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    const total = initialTotal ?? initialQueue.length + initialDone + initialFailed;
    let queue = [...initialQueue];
    let done = initialDone;
    let failed = initialFailed;
    setBulkGen({ running: true, done, total, failed, queue });
    persistQueue(queue, done, failed, total);

    while (queue.length > 0) {
      if (cancelRef.current) break;
      const id = queue[0];
      let attempt = 0;
      let success = false;
      while (attempt < 3 && !cancelRef.current) {
        try {
          const out: any = await withTimeout(genPhoto({ data: { recipeId: id } }), PER_CALL_TIMEOUT_MS);
          if (out?.url) {
            setRows((rs) => rs.map((x) => (x.id === id ? { ...x, image_url: out.url } : x)));
          }
          success = true;
          break;
        } catch (e: any) {
          const msg = String(e?.message || "");
          // Backoff for rate limit / transient
          const wait = msg.includes("429") || msg.toLowerCase().includes("rate") ? 5000 * (attempt + 1) : 1500 * (attempt + 1);
          attempt++;
          if (attempt < 3) await new Promise((r) => setTimeout(r, wait));
        }
      }
      if (success) done++;
      else failed++;
      queue = queue.slice(1);
      setBulkGen({ running: true, done, total, failed, queue });
      persistQueue(queue, done, failed, total);
      await new Promise((r) => setTimeout(r, 500));
    }

    runningRef.current = false;
    const wasCancelled = cancelRef.current;
    setBulkGen({ running: false, done, total, failed, queue });
    persistQueue([], done, failed, total);
    if (wasCancelled) toast(`Stopped: ${done} generated${failed > 0 ? `, ${failed} failed` : ""}`);
    else toast.success(`Generated ${done} photo${done === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}`);
  };

  const generateAllMissing = async () => {
    if (runningRef.current) return;
    if (allMissingPhoto.length === 0) {
      toast.info("All recipes already have photos.");
      return;
    }
    const ok = await askConfirm({
      title: `Generate ${allMissingPhoto.length} missing photo${allMissingPhoto.length === 1 ? "" : "s"}?`,
      description: `Uses AI credits. Estimated ~${Math.ceil(allMissingPhoto.length * 7)}s. Progress is saved — if the page reloads it will resume automatically.`,
    });
    if (!ok) return;
    await runQueue(allMissingPhoto.map((r) => r.id));
  };

  const cancelBulk = () => {
    cancelRef.current = true;
  };

  // Auto-resume on mount if a previous batch was interrupted
  useEffect(() => {
    if (rows.length === 0) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { queue: string[]; done: number; failed: number; total: number };
      if (!saved.queue || saved.queue.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      // Filter out any IDs that already have photos (e.g. completed in another tab)
      const stillMissing = saved.queue.filter((id) => {
        const r = rows.find((x) => x.id === id);
        return r && !r.image_url;
      });
      if (stillMissing.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      toast.info(`Resuming photo generation (${stillMissing.length} left)…`);
      runQueue(stillMissing, saved.done, saved.failed, saved.total);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length > 0]);


  return (
    <div className="space-y-6 p-6">
      <PageHelpCard route="/admin/recipe-hub" />
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-primary">Recipes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage cost, content, video, monetization, and quality across all recipes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={recomputeAllCosts}
            disabled={recomputingAll || rows.length === 0}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${recomputingAll ? "animate-spin" : ""}`} />
            {recomputingAll ? "Recomputing…" : "Recompute all costs"}
          </Button>
          <Button
            variant="outline"
            onClick={generateAllMissing}
            disabled={bulkGen.running || allMissingPhoto.length === 0}
            className="gap-1.5"
          >
            {bulkGen.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate missing photos ({allMissingPhoto.length})
          </Button>
          <Link to="/admin/recipes/new"><Button><Plus className="w-4 h-4 mr-2" />New recipe</Button></Link>
          <Link to="/recipes" target="_blank"><Button variant="outline">View public hub</Button></Link>
        </div>
      </header>

      {bulkGen.running || (bulkGen.total > 0 && bulkGen.done < bulkGen.total) ? (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-medium">
                Generating photos: {bulkGen.done} / {bulkGen.total}
                {bulkGen.failed > 0 && <span className="text-destructive ml-2">· {bulkGen.failed} failed</span>}
              </div>
              {bulkGen.running && (
                <Button size="sm" variant="ghost" onClick={cancelBulk} className="gap-1">
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
              )}
            </div>
            <Progress value={bulkGen.total > 0 ? (bulkGen.done / bulkGen.total) * 100 : 0} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total recipes" value={stats.total} icon={<ChefHat className="w-4 h-4" />} />
        <Stat label="With photo" value={`${stats.withPhoto} / ${stats.total}`} icon={<ImageOff className="w-4 h-4" />} />
        <Stat label="With video" value={`${stats.withVideo} / ${stats.total}`} icon={<Video className="w-4 h-4" />} />
        <Stat label="With shop items" value={`${stats.withShop} / ${stats.total}`} icon={<ShoppingBag className="w-4 h-4" />} />
        <Stat label="Drafts (inactive)" value={stats.drafts} />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…" className="pl-9" />
          </div>
          <FilterChips
            value={kind}
            onChange={setKind}
            options={[["all", "All kinds"], ["food", "Food"], ["cocktail", "Cocktails"]]}
          />
          <FilterChips
            value={status}
            onChange={setStatus}
            options={[["all", "Any status"], ["active", "On menu"], ["off", "Off menu"]]}
          />
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              ["all", "All"],
              ["no-photo", "Missing photo"],
              ["no-video", "Missing video"],
              ["no-shop", "Missing shop items"],
              ["draft", "Drafts"],
            ]}
          />
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">No recipes match.</p>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left">
              <tr>
                <th className="px-4 py-2 w-8">
                  <Checkbox
                    checked={visible.length > 0 && visible.every((r) => selectedIds.has(r.id))}
                    onCheckedChange={(c) => {
                      setSelectedIds((s) => {
                        const n = new Set(s);
                        if (c) visible.forEach((r) => n.add(r.id));
                        else visible.forEach((r) => n.delete(r.id));
                        return n;
                      });
                    }}
                  />
                </th>
                <th className="px-4 py-2">Recipe</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Cost/serving</th>
                <th className="px-4 py-2">Video</th>
                <th className="px-4 py-2">Shop</th>
                <th className="px-4 py-2">Tips</th>
                <th className="px-4 py-2">Scores (A/V/E/S)</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const tipCount = Array.isArray(r.pro_tips) ? r.pro_tips.length : 0;
                const hasVideo = !!parseYouTubeId(r.video_url);
                return (
                  <tr key={r.id} className={`border-t border-border hover:bg-secondary/20 ${selectedIds.has(r.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-2">
                      <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        {r.image_url ? (
                          <img src={r.image_url} className="w-10 h-10 rounded object-cover" alt="" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                            <ImageOff className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{[r.category, r.use_case].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        {r.active ? <Badge variant="secondary">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                        {r.pricing_status && r.pricing_status !== "valid" && (
                          <Badge variant="destructive" className="text-[10px]" title={Array.isArray(r.pricing_errors) ? r.pricing_errors.map((e: any) => `${e.ingredient}: ${e.message}`).join("\n") : ""}>
                            {r.pricing_status.replace("blocked_missing_", "needs ")}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.pricing_status && r.pricing_status !== "valid"
                        ? <span className="text-destructive text-xs">blocked</span>
                        : r.cost_per_serving != null ? `$${Number(r.cost_per_serving).toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2">{hasVideo ? <Badge>YouTube</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">
                      {(r.shop_count || 0) > 0 ? <Badge variant="secondary">{r.shop_count}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      {tipCount >= 3 ? <Badge variant="secondary">{tipCount}</Badge> : <span className="text-muted-foreground">{tipCount}/3</span>}
                    </td>
                    <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">
                      {r.score_affiliate}/{r.score_video}/{r.score_event}/{r.score_seasonal}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link to="/admin/recipe-hub/$id" params={{ id: r.id }}>
                        <Button size="sm" variant="outline"><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <RecipeBulkActions
        recipes={visible.map((r) => ({ id: r.id, name: r.name, image_url: r.image_url }))}
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds(new Set())}
        onPhotoUpdated={(id, url) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, image_url: url } : x)))}
      />
    </div>
  );
}

function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-3 py-1 rounded-full transition-colors ${value === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-display text-foreground mt-2">{value}</p>
      </CardContent>
    </Card>
  );
}
