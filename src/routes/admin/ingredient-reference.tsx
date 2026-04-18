import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Save, Link2, Unlink, RefreshCw, Loader2, BookOpen, Merge, X, ChevronDown, ChevronRight, ChefHat, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/ingredient-reference")({
  head: () => ({
    meta: [
      { title: "Ingredient Reference — TasteQuote" },
      { name: "description", content: "Manage canonical ingredient definitions, units, density, waste, and inventory links." },
    ],
  }),
  component: IngredientReferencePage,
});

interface RefRow {
  id: string;
  canonical_name: string;
  canonical_normalized: string;
  default_unit: string;
  density_g_per_ml: number | null;
  waste_factor: number;
  inventory_item_id: string | null;
  category: string | null;
  notes: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
}

interface RowState extends RefRow {
  draft: {
    canonical_name: string;
    default_unit: string;
    density_g_per_ml: string;
    waste_factor: string;
    inventory_item_id: string | null;
  };
  saving: boolean;
  recomputing: boolean;
  linkQuery: string;
  linkResults: InventoryItem[];
  linking: boolean;
  showLinker: boolean;
  expanded: boolean;
}

interface RecipeUsage {
  recipe_id: string;
  recipe_name: string;
  cost_per_serving: number | null;
  servings: number;
  ingredient_name: string;
  match: "reference" | "inventory" | "name";
}

function toDraft(r: RefRow): RowState["draft"] {
  return {
    canonical_name: r.canonical_name,
    default_unit: r.default_unit ?? "each",
    density_g_per_ml: r.density_g_per_ml == null ? "" : String(r.density_g_per_ml),
    waste_factor: r.waste_factor == null ? "1" : String(r.waste_factor),
    inventory_item_id: r.inventory_item_id,
  };
}

function isDirty(r: RowState) {
  const d = r.draft;
  return (
    d.canonical_name.trim() !== r.canonical_name ||
    d.default_unit.trim() !== (r.default_unit ?? "each") ||
    (d.density_g_per_ml === "" ? null : Number(d.density_g_per_ml)) !== r.density_g_per_ml ||
    Number(d.waste_factor || "1") !== Number(r.waste_factor ?? 1) ||
    d.inventory_item_id !== r.inventory_item_id
  );
}

function IngredientReferencePage() {
  const [rows, setRows] = useState<RowState[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRecomputing, setBatchRecomputing] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState<string | null>(null);
  const [mergeRemoveId, setMergeRemoveId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [usageByRef, setUsageByRef] = useState<Map<string, RecipeUsage[]>>(new Map());
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    canonical_name: "",
    default_unit: "each",
    density_g_per_ml: "",
    waste_factor: "1",
    category: "",
    notes: "",
  });
  const [creating, setCreating] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestRefId, setSuggestRefId] = useState<string | null>(null);
  const [suggestRefName, setSuggestRefName] = useState<string>("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestAttaching, setSuggestAttaching] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ alias: string; alias_normalized: string; score: number; usage: number; selected: boolean }>
  >([]);

  const resetCreateDraft = () => {
    setCreateDraft({
      canonical_name: "",
      default_unit: "each",
      density_g_per_ml: "",
      waste_factor: "1",
      category: "",
      notes: "",
    });
  };

  const normalizeName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const handleCreate = async () => {
    const name = createDraft.canonical_name.trim();
    if (!name) {
      toast.error("Canonical name is required");
      return;
    }
    const norm = normalizeName(name);
    if (!norm) {
      toast.error("Canonical name must contain letters or numbers");
      return;
    }
    if (rows.some((r) => r.canonical_normalized === norm)) {
      toast.error("A reference with that normalized name already exists");
      return;
    }
    const density = createDraft.density_g_per_ml.trim() === "" ? null : Number(createDraft.density_g_per_ml);
    if (density != null && (!Number.isFinite(density) || density <= 0)) {
      toast.error("Density must be a positive number or empty");
      return;
    }
    const waste = Number(createDraft.waste_factor || "1");
    if (!Number.isFinite(waste) || waste <= 0 || waste > 1) {
      toast.error("Waste factor must be between 0 and 1 (e.g. 0.85)");
      return;
    }
    setCreating(true);
    const { data: inserted, error } = await supabase
      .from("ingredient_reference")
      .insert({
        canonical_name: name,
        canonical_normalized: norm,
        default_unit: createDraft.default_unit.trim() || "each",
        density_g_per_ml: density,
        waste_factor: waste,
        category: createDraft.category.trim() || null,
        notes: createDraft.notes.trim() || null,
      })
      .select("id,canonical_name,canonical_normalized")
      .single();
    setCreating(false);
    if (error || !inserted) {
      toast.error(error?.message ?? "Failed to create reference");
      return;
    }
    toast.success(`Created "${name}"`);
    resetCreateDraft();
    setCreateOpen(false);
    await load();
    await scanSynonymSuggestions(inserted.id, inserted.canonical_name, inserted.canonical_normalized);
  };

  // ===== Synonym suggestion scan =====
  const tokenize = (s: string) => normalizeName(s).split(" ").filter((t) => t.length >= 2);

  const fuzzyScore = (a: string, b: string): number => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    const ta = new Set(tokenize(a));
    const tb = new Set(tokenize(b));
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const jaccard = inter / (ta.size + tb.size - inter);
    let sub = 0;
    for (const x of ta) for (const y of tb) {
      if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) {
        sub = Math.max(sub, 0.4);
      }
    }
    return Math.max(jaccard, sub);
  };

  const scanSynonymSuggestions = async (
    refId: string,
    refName: string,
    refNormalized: string,
  ) => {
    setSuggestRefId(refId);
    setSuggestRefName(refName);
    setSuggestOpen(true);
    setSuggestLoading(true);
    setSuggestions([]);

    const [ingRes, synRes, refsRes, dismissRes] = await Promise.all([
      supabase.from("recipe_ingredients").select("name,reference_id"),
      supabase.from("ingredient_synonyms").select("alias_normalized"),
      supabase.from("ingredient_reference").select("canonical_normalized"),
      supabase.from("ingredient_synonym_dismissed").select("alias_normalized"),
    ]);
    if (ingRes.error) {
      toast.error(ingRes.error.message);
      setSuggestLoading(false);
      return;
    }
    const existingAliases = new Set<string>((synRes.data ?? []).map((s: any) => s.alias_normalized));
    const existingRefs = new Set<string>((refsRes.data ?? []).map((r: any) => r.canonical_normalized));
    const dismissed = new Set<string>((dismissRes.data ?? []).map((d: any) => d.alias_normalized));

    const byNorm = new Map<string, { alias: string; usage: number; hasLink: boolean }>();
    for (const ing of (ingRes.data ?? []) as any[]) {
      const raw = String(ing.name ?? "").trim();
      if (!raw) continue;
      const n = normalizeName(raw);
      if (!n || n === refNormalized) continue;
      if (existingAliases.has(n) || existingRefs.has(n) || dismissed.has(n)) continue;
      const cur = byNorm.get(n) ?? { alias: raw, usage: 0, hasLink: false };
      cur.usage += 1;
      if (ing.reference_id) cur.hasLink = true;
      if (raw.length < cur.alias.length) cur.alias = raw;
      byNorm.set(n, cur);
    }

    const scored: Array<{ alias: string; alias_normalized: string; score: number; usage: number; selected: boolean }> = [];
    for (const [norm, info] of byNorm) {
      if (info.hasLink) continue;
      const score = fuzzyScore(refNormalized, norm);
      if (score >= 0.35) {
        scored.push({
          alias: info.alias,
          alias_normalized: norm,
          score,
          usage: info.usage,
          selected: score >= 0.6,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score || b.usage - a.usage);
    setSuggestions(scored.slice(0, 25));
    setSuggestLoading(false);
  };

  const handleAttachSelected = async () => {
    if (!suggestRefId) return;
    const picks = suggestions.filter((s) => s.selected);
    if (picks.length === 0) {
      setSuggestOpen(false);
      return;
    }
    setSuggestAttaching(true);
    const { error } = await supabase.from("ingredient_synonyms").insert(
      picks.map((p) => ({
        alias: p.alias,
        alias_normalized: p.alias_normalized,
        canonical: suggestRefName,
        reference_id: suggestRefId,
      })),
    );
    setSuggestAttaching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Attached ${picks.length} synonym${picks.length === 1 ? "" : "s"}`);
    setSuggestOpen(false);
    setSuggestions([]);
    await load();
  };

  const handleDismissSuggestion = async (aliasNorm: string) => {
    setSuggestions((prev) => prev.filter((s) => s.alias_normalized !== aliasNorm));
    await supabase
      .from("ingredient_synonym_dismissed")
      .insert({ alias_normalized: aliasNorm });
  };

  const load = async () => {
    setLoading(true);
    const [refRes, invRes, ingRes, recRes] = await Promise.all([
      supabase.from("ingredient_reference").select("*").order("canonical_name", { ascending: true }),
      supabase.from("inventory_items").select("id,name,unit").order("name", { ascending: true }),
      supabase.from("recipe_ingredients").select("recipe_id,name,reference_id,inventory_item_id"),
      supabase.from("recipes").select("id,name,cost_per_serving,servings,active").eq("active", true),
    ]);
    if (refRes.error) toast.error(refRes.error.message);
    if (invRes.error) toast.error(invRes.error.message);
    const refs = (refRes.data ?? []) as RefRow[];
    setInventory((invRes.data ?? []) as InventoryItem[]);

    // Build usage map: refId -> RecipeUsage[]
    const recipeById = new Map<string, { id: string; name: string; cost_per_serving: number | null; servings: number }>();
    for (const r of (recRes.data ?? []) as any[]) recipeById.set(r.id, r);
    const refByNorm = new Map<string, RefRow>();
    const refByInv = new Map<string, RefRow>();
    for (const r of refs) {
      refByNorm.set(r.canonical_normalized, r);
      if (r.inventory_item_id) refByInv.set(r.inventory_item_id, r);
    }
    const usage = new Map<string, RecipeUsage[]>();
    const seen = new Set<string>(); // dedupe (refId|recipeId)
    const push = (refId: string, recipeId: string, ingName: string, match: RecipeUsage["match"]) => {
      const key = `${refId}|${recipeId}`;
      if (seen.has(key)) return;
      const rec = recipeById.get(recipeId);
      if (!rec) return;
      seen.add(key);
      const arr = usage.get(refId) ?? [];
      arr.push({
        recipe_id: recipeId,
        recipe_name: rec.name,
        cost_per_serving: rec.cost_per_serving,
        servings: rec.servings,
        ingredient_name: ingName,
        match,
      });
      usage.set(refId, arr);
    };
    for (const ing of (ingRes.data ?? []) as any[]) {
      if (!ing.recipe_id) continue;
      if (ing.reference_id && refs.some((r) => r.id === ing.reference_id)) {
        push(ing.reference_id, ing.recipe_id, ing.name, "reference");
        continue;
      }
      if (ing.inventory_item_id) {
        const ref = refByInv.get(ing.inventory_item_id);
        if (ref) {
          push(ref.id, ing.recipe_id, ing.name, "inventory");
          continue;
        }
      }
      const norm = String(ing.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const ref = refByNorm.get(norm);
      if (ref) push(ref.id, ing.recipe_id, ing.name, "name");
    }
    // Sort each list by cost_per_serving desc (outliers first)
    for (const [, list] of usage) {
      list.sort((a, b) => (b.cost_per_serving ?? -1) - (a.cost_per_serving ?? -1));
    }
    setUsageByRef(usage);

    setRows(
      refs.map((r) => ({
        ...r,
        draft: toDraft(r),
        saving: false,
        recomputing: false,
        linkQuery: "",
        linkResults: [],
        linking: false,
        showLinker: false,
        expanded: false,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const inventoryById = useMemo(() => {
    const m = new Map<string, InventoryItem>();
    for (const i of inventory) m.set(i.id, i);
    return m;
  }, [inventory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "linked" && !r.inventory_item_id) return false;
      if (filter === "unlinked" && r.inventory_item_id) return false;
      if (!q) return true;
      const inv = r.inventory_item_id ? inventoryById.get(r.inventory_item_id)?.name ?? "" : "";
      return (
        r.canonical_name.toLowerCase().includes(q) ||
        r.canonical_normalized.includes(q) ||
        inv.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter, inventoryById]);

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateDraft = (id: string, patch: Partial<RowState["draft"]>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, draft: { ...r.draft, ...patch } } : r)),
    );
  };

  const handleSave = async (row: RowState) => {
    const d = row.draft;
    const name = d.canonical_name.trim();
    if (!name) {
      toast.error("Canonical name is required");
      return;
    }
    updateRow(row.id, { saving: true });
    const payload: Partial<RefRow> = {
      canonical_name: name,
      default_unit: d.default_unit.trim() || "each",
      density_g_per_ml: d.density_g_per_ml === "" ? null : Number(d.density_g_per_ml),
      waste_factor: Number(d.waste_factor || "1"),
      inventory_item_id: d.inventory_item_id,
    };
    const { data, error } = await supabase
      .from("ingredient_reference")
      .update(payload)
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      updateRow(row.id, { saving: false });
      return;
    }
    const fresh = data as RefRow;
    updateRow(row.id, { ...fresh, draft: toDraft(fresh), saving: false });
    toast.success("Saved");
  };

  const handleUnlink = async (row: RowState) => {
    updateDraft(row.id, { inventory_item_id: null });
    const { data, error } = await supabase
      .from("ingredient_reference")
      .update({ inventory_item_id: null })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const fresh = data as RefRow;
    updateRow(row.id, { ...fresh, draft: toDraft(fresh) });
    toast.success("Unlinked");
  };

  const handleLink = async (row: RowState, item: InventoryItem) => {
    updateRow(row.id, { linking: true });
    const { data, error } = await supabase
      .from("ingredient_reference")
      .update({ inventory_item_id: item.id })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      updateRow(row.id, { linking: false });
      return;
    }
    const fresh = data as RefRow;
    updateRow(row.id, {
      ...fresh,
      draft: toDraft(fresh),
      linking: false,
      showLinker: false,
      linkQuery: "",
      linkResults: [],
    });
    toast.success(`Linked to ${item.name}`);
  };

  const searchInventory = (row: RowState, q: string) => {
    const query = q.trim().toLowerCase();
    if (!query) {
      updateRow(row.id, { linkQuery: q, linkResults: [] });
      return;
    }
    const results = inventory
      .filter((i) => i.name.toLowerCase().includes(query))
      .slice(0, 8);
    updateRow(row.id, { linkQuery: q, linkResults: results });
  };

  // Find recipe ids that depend on a reference (by reference_id, linked inventory_item_id, or normalized name fallback)
  const collectAffectedRecipeIds = async (refs: RowState[]): Promise<Set<string>> => {
    const ids = new Set<string>();
    if (refs.length === 0) return ids;

    const refIds = refs.map((r) => r.id);
    const invIds = refs.map((r) => r.inventory_item_id).filter((x): x is string => !!x);
    const conditions: string[] = [`reference_id.in.(${refIds.join(",")})`];
    if (invIds.length > 0) conditions.push(`inventory_item_id.in.(${invIds.join(",")})`);

    const { data: ings, error } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id,name")
      .or(conditions.join(","));
    if (error) {
      toast.error(error.message);
      return ids;
    }
    for (const ing of ings ?? []) {
      if ((ing as any).recipe_id) ids.add((ing as any).recipe_id);
    }

    // Name-based fallback for ingredients that have neither reference_id nor inventory link
    const normSet = new Set(refs.map((r) => r.canonical_normalized));
    const { data: byName } = await supabase.from("recipe_ingredients").select("recipe_id,name");
    for (const ing of byName ?? []) {
      const n = (ing as any).name as string;
      if (!n) continue;
      const norm = n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (normSet.has(norm)) ids.add((ing as any).recipe_id);
    }
    return ids;
  };

  const recomputeRecipes = async (recipeIds: Set<string>): Promise<{ ok: number; fail: number }> => {
    let ok = 0;
    let fail = 0;
    await Promise.all(
      Array.from(recipeIds).map(async (rid) => {
        const { error: rpcErr } = await supabase.rpc("recompute_recipe_cost", { _recipe_id: rid });
        if (rpcErr) fail++;
        else ok++;
      }),
    );
    return { ok, fail };
  };

  const handleRecompute = async (row: RowState) => {
    updateRow(row.id, { recomputing: true });
    const ids = await collectAffectedRecipeIds([row]);
    if (ids.size === 0) {
      toast.info("No recipes use this ingredient");
      updateRow(row.id, { recomputing: false });
      return;
    }
    const { ok, fail } = await recomputeRecipes(ids);
    updateRow(row.id, { recomputing: false });
    if (fail) toast.warning(`Recomputed ${ok}, ${fail} failed`);
    else toast.success(`Recomputed ${ok} recipe${ok === 1 ? "" : "s"}`);
  };

  const handleBatchRecompute = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    setBatchRecomputing(true);
    try {
      const ids = await collectAffectedRecipeIds(targets);
      if (ids.size === 0) {
        toast.info("No recipes use the selected ingredients");
        return;
      }
      const { ok, fail } = await recomputeRecipes(ids);
      if (fail) toast.warning(`Recomputed ${ok} of ${ids.size} recipes (${fail} failed) across ${targets.length} ingredients`);
      else toast.success(`Recomputed ${ok} recipe${ok === 1 ? "" : "s"} across ${targets.length} ingredient${targets.length === 1 ? "" : "s"}`);
    } finally {
      setBatchRecomputing(false);
    }
  };

  const openMergeDialog = () => {
    if (selected.size !== 2) return;
    const [a, b] = Array.from(selected);
    // Default: keep the linked one (or the first)
    const rowA = rows.find((r) => r.id === a);
    const rowB = rows.find((r) => r.id === b);
    const keep = rowA?.inventory_item_id && !rowB?.inventory_item_id ? a : b && !rowA?.inventory_item_id && rowB?.inventory_item_id ? b : a;
    setMergeKeepId(keep);
    setMergeRemoveId(keep === a ? b : a);
    setMergeOpen(true);
  };

  const handleMerge = async () => {
    if (!mergeKeepId || !mergeRemoveId || mergeKeepId === mergeRemoveId) return;
    const keep = rows.find((r) => r.id === mergeKeepId);
    const remove = rows.find((r) => r.id === mergeRemoveId);
    if (!keep || !remove) return;
    setMerging(true);
    try {
      // 1. Rewrite recipe_ingredients.reference_id from remove → keep
      const { error: riErr, count: riCount } = await supabase
        .from("recipe_ingredients")
        .update({ reference_id: keep.id }, { count: "exact" })
        .eq("reference_id", remove.id);
      if (riErr) throw riErr;

      // 2. Repoint synonyms from remove → keep, and add the removed canonical name as a synonym
      await supabase
        .from("ingredient_synonyms")
        .update({ reference_id: keep.id, canonical: keep.canonical_name })
        .eq("reference_id", remove.id);

      await supabase
        .from("ingredient_synonyms")
        .upsert(
          {
            alias: remove.canonical_name,
            alias_normalized: remove.canonical_normalized,
            canonical: keep.canonical_name,
            reference_id: keep.id,
          },
          { onConflict: "alias_normalized" },
        );

      // 3. If keep has no inventory link but remove does, inherit it
      if (!keep.inventory_item_id && remove.inventory_item_id) {
        await supabase
          .from("ingredient_reference")
          .update({ inventory_item_id: remove.inventory_item_id })
          .eq("id", keep.id);
      }

      // 4. Delete the removed reference (FK on recipe_ingredients was nulled by the update above)
      const { error: delErr } = await supabase.from("ingredient_reference").delete().eq("id", remove.id);
      if (delErr) throw delErr;

      toast.success(`Merged "${remove.canonical_name}" → "${keep.canonical_name}" (${riCount ?? 0} recipe ingredient${riCount === 1 ? "" : "s"} repointed)`);

      // 5. Recompute affected recipes
      const ids = await collectAffectedRecipeIds([keep]);
      if (ids.size > 0) {
        const { ok, fail } = await recomputeRecipes(ids);
        if (fail) toast.warning(`Recomputed ${ok} of ${ids.size} recipes (${fail} failed)`);
        else if (ok > 0) toast.success(`Recomputed ${ok} affected recipe${ok === 1 ? "" : "s"}`);
      }

      setMergeOpen(false);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const counts = useMemo(() => {
    const linked = rows.filter((r) => r.inventory_item_id).length;
    return { total: rows.length, linked, unlinked: rows.length - linked };
  }, [rows]);

  const mergeKeepRow = mergeKeepId ? rows.find((r) => r.id === mergeKeepId) ?? null : null;
  const mergeRemoveRow = mergeRemoveId ? rows.find((r) => r.id === mergeRemoveId) ?? null : null;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            Ingredient Reference
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Canonical ingredients used by recipes for costing. Edit defaults and link inventory.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={createOpen ? "secondary" : "default"}
            size="sm"
            onClick={() => setCreateOpen((o) => !o)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {createOpen ? "Cancel" : "New reference"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {createOpen && (
        <Card className="border-primary/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Create new ingredient reference
              </h3>
              <span className="text-[10px] text-muted-foreground">
                Seed a canonical entry. Link inventory afterward from the row.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">Canonical name *</Label>
                <Input
                  placeholder="e.g. Roma Tomato"
                  value={createDraft.canonical_name}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, canonical_name: e.target.value }))
                  }
                  autoFocus
                />
                {createDraft.canonical_name.trim() && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    normalized: {normalizeName(createDraft.canonical_name) || "(empty)"}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default unit</Label>
                <Input
                  placeholder="each, lb, oz, cup, ml..."
                  value={createDraft.default_unit}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, default_unit: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Density (g/ml)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="optional, e.g. 0.53 for flour"
                  value={createDraft.density_g_per_ml}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, density_g_per_ml: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Waste factor (0–1)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  placeholder="1.0 = no waste, 0.85 = 15% loss"
                  value={createDraft.waste_factor}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, waste_factor: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Input
                  placeholder="produce, dairy, protein..."
                  value={createDraft.category}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, category: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">Notes</Label>
                <Input
                  placeholder="Optional notes about sourcing, prep, etc."
                  value={createDraft.notes}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetCreateDraft();
                  setCreateOpen(false);
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={creating || !createDraft.canonical_name.trim()}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1.5" />
                )}
                Create reference
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search canonical name, inventory, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "linked", "unlinked"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground ml-auto">
            {counts.total} total · {counts.linked} linked · {counts.unlinked} unlinked
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {selected.size} selected
            </Badge>
            <Button
              size="sm"
              onClick={handleBatchRecompute}
              disabled={batchRecomputing}
            >
              {batchRecomputing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              Recompute affected recipes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openMergeDialog}
              disabled={selected.size !== 2}
              title={selected.size !== 2 ? "Select exactly 2 references to merge" : "Merge these two references"}
            >
              <Merge className="w-4 h-4 mr-1.5" />
              Merge duplicates
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="ml-auto"
            >
              <X className="w-4 h-4 mr-1.5" />
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No references match your filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const linkedItem = row.inventory_item_id ? inventoryById.get(row.inventory_item_id) : null;
            const dirty = isDirty(row);
            const usages = usageByRef.get(row.id) ?? [];
            const usageCount = usages.length;
            const costs = usages.map((u) => u.cost_per_serving).filter((c): c is number => typeof c === "number" && c > 0);
            const median = costs.length
              ? [...costs].sort((a, b) => a - b)[Math.floor(costs.length / 2)]
              : null;
            return (
              <Card key={row.id} className={selected.has(row.id) ? "border-primary/50 ring-1 ring-primary/30" : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-4 flex gap-2">
                      <div className="pt-6">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.canonical_name}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs">Canonical name</Label>
                        <Input
                          value={row.draft.canonical_name}
                          onChange={(e) => updateDraft(row.id, { canonical_name: e.target.value })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">
                          norm: {row.canonical_normalized}
                          {row.category ? ` · ${row.category}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Default unit</Label>
                      <Input
                        value={row.draft.default_unit}
                        onChange={(e) => updateDraft(row.id, { default_unit: e.target.value })}
                        placeholder="each"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Density (g/ml)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.draft.density_g_per_ml}
                        onChange={(e) => updateDraft(row.id, { density_g_per_ml: e.target.value })}
                        placeholder="—"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Waste factor</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.draft.waste_factor}
                        onChange={(e) => updateDraft(row.id, { waste_factor: e.target.value })}
                        placeholder="1.0"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1.5 md:items-end md:justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleSave(row)}
                        disabled={row.saving || !dirty}
                        className="w-full"
                      >
                        {row.saving ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-1.5" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRecompute(row)}
                        disabled={row.recomputing}
                        className="w-full"
                        title="Recompute cost for all recipes that use this ingredient"
                      >
                        {row.recomputing ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1.5" />
                        )}
                        Recompute
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                    <button
                      type="button"
                      onClick={() => updateRow(row.id, { expanded: !row.expanded })}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-accent"
                      title={usageCount === 0 ? "Not used by any active recipe" : "Show recipes using this ingredient"}
                      disabled={usageCount === 0}
                    >
                      {row.expanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <ChefHat className="w-3 h-3" />
                      Used in {usageCount} recipe{usageCount === 1 ? "" : "s"}
                    </button>
                    <span className="text-xs text-muted-foreground">Inventory link:</span>
                    {linkedItem ? (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <Link2 className="w-3 h-3" />
                          {linkedItem.name}
                          <span className="text-muted-foreground">({linkedItem.unit})</span>
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleUnlink(row)}>
                          <Unlink className="w-3.5 h-3.5 mr-1" />
                          Unlink
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Unlinked
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => updateRow(row.id, { showLinker: !row.showLinker })}
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1" />
                      {row.showLinker ? "Cancel" : linkedItem ? "Change link" : "Link inventory"}
                    </Button>
                  </div>

                  {row.expanded && usageCount > 0 && (
                    <div className="rounded-md border bg-muted/30 divide-y">
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                        <span>Recipes using this ingredient (sorted by cost/serving, outliers first)</span>
                        {median != null && (
                          <span>median: ${median.toFixed(2)}</span>
                        )}
                      </div>
                      {usages.map((u) => {
                        const cost = u.cost_per_serving;
                        const isOutlier =
                          median != null && cost != null && cost > 0 && (cost > median * 2 || cost < median / 2);
                        return (
                          <Link
                            key={u.recipe_id}
                            to="/admin/recipes/$id/edit"
                            params={{ id: u.recipe_id }}
                            className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{u.recipe_name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                as "{u.ingredient_name}" · {u.servings} serving{u.servings === 1 ? "" : "s"} · match: {u.match}
                              </div>
                            </div>
                            <Badge
                              variant={isOutlier ? "destructive" : cost == null || cost === 0 ? "outline" : "secondary"}
                              className="font-mono shrink-0"
                            >
                              {cost == null || cost === 0 ? "—" : `$${cost.toFixed(2)}/serv`}
                            </Badge>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {row.showLinker && (
                    <div className="space-y-2 pt-1">
                      <Input
                        placeholder="Search inventory items..."
                        value={row.linkQuery}
                        onChange={(e) => searchInventory(row, e.target.value)}
                        autoFocus
                      />
                      {row.linkResults.length > 0 && (
                        <div className="border rounded-md divide-y max-h-56 overflow-auto">
                          {row.linkResults.map((it) => (
                            <button
                              key={it.id}
                              onClick={() => handleLink(row, it)}
                              disabled={row.linking}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                            >
                              <span>{it.name}</span>
                              <span className="text-xs text-muted-foreground">{it.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {row.linkQuery && row.linkResults.length === 0 && (
                        <p className="text-xs text-muted-foreground">No matches.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Suggested synonyms for "{suggestRefName}"</DialogTitle>
            <DialogDescription>
              Unlinked ingredient names from your recipes that look similar. Check the ones you want to attach as synonyms — future imports will auto-resolve them to this reference.
            </DialogDescription>
          </DialogHeader>

          {suggestLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Scanning recipe ingredients...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No fuzzy matches found in unlinked recipe ingredients.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSuggestions((prev) => prev.map((s) => ({ ...s, selected: true })))}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSuggestions((prev) => prev.map((s) => ({ ...s, selected: false })))}
                >
                  Clear
                </Button>
                <span className="ml-auto text-muted-foreground">
                  {suggestions.filter((s) => s.selected).length} of {suggestions.length} selected
                </span>
              </div>
              <div className="max-h-[55vh] overflow-y-auto divide-y rounded-md border">
                {suggestions.map((s) => (
                  <div key={s.alias_normalized} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40">
                    <Checkbox
                      checked={s.selected}
                      onCheckedChange={(v) =>
                        setSuggestions((prev) =>
                          prev.map((x) =>
                            x.alias_normalized === s.alias_normalized ? { ...x, selected: !!v } : x,
                          ),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{s.alias}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {s.alias_normalized}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      used {s.usage}×
                    </Badge>
                    <Badge
                      variant={s.score >= 0.8 ? "default" : s.score >= 0.6 ? "secondary" : "outline"}
                      className="text-[10px] shrink-0 font-mono"
                    >
                      {Math.round(s.score * 100)}%
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Dismiss — never suggest this alias again"
                      onClick={() => handleDismissSuggestion(s.alias_normalized)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestOpen(false)} disabled={suggestAttaching}>
              Skip
            </Button>
            <Button
              onClick={handleAttachSelected}
              disabled={suggestAttaching || suggestions.filter((s) => s.selected).length === 0}
            >
              {suggestAttaching ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-1.5" />
              )}
              Attach {suggestions.filter((s) => s.selected).length} synonym
              {suggestions.filter((s) => s.selected).length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge ingredient references</DialogTitle>
            <DialogDescription>
              Repoints all <code className="text-xs">recipe_ingredients.reference_id</code> from the removed reference to the kept one,
              moves synonyms, and adds the removed name as a synonym so future imports auto-resolve. The removed reference is then deleted.
              Affected recipes are recomputed automatically.
            </DialogDescription>
          </DialogHeader>

          {mergeKeepRow && mergeRemoveRow && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMergeKeepId(mergeRemoveRow.id);
                    setMergeRemoveId(mergeKeepRow.id);
                  }}
                  className="text-left rounded-md border-2 border-primary bg-primary/5 p-3 transition-colors"
                >
                  <div className="text-[10px] font-semibold uppercase text-primary mb-1">Keep</div>
                  <div className="font-medium text-sm truncate">{mergeKeepRow.canonical_name}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {mergeKeepRow.inventory_item_id
                      ? `Linked: ${inventoryById.get(mergeKeepRow.inventory_item_id)?.name ?? "—"}`
                      : "Unlinked"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    unit: {mergeKeepRow.default_unit} · waste: {mergeKeepRow.waste_factor}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMergeKeepId(mergeRemoveRow.id);
                    setMergeRemoveId(mergeKeepRow.id);
                  }}
                  className="text-left rounded-md border-2 border-destructive/40 bg-destructive/5 p-3 transition-colors"
                >
                  <div className="text-[10px] font-semibold uppercase text-destructive mb-1">Remove</div>
                  <div className="font-medium text-sm truncate">{mergeRemoveRow.canonical_name}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {mergeRemoveRow.inventory_item_id
                      ? `Linked: ${inventoryById.get(mergeRemoveRow.inventory_item_id)?.name ?? "—"}`
                      : "Unlinked"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    unit: {mergeRemoveRow.default_unit} · waste: {mergeRemoveRow.waste_factor}
                  </div>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Click either card to swap which reference is kept.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={merging || !mergeKeepId || !mergeRemoveId}>
              {merging ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Merge className="w-4 h-4 mr-1.5" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
