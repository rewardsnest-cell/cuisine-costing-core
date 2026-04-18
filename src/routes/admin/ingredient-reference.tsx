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
import { Search, Save, Link2, Unlink, RefreshCw, Loader2, BookOpen, Merge, X } from "lucide-react";
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

  const load = async () => {
    setLoading(true);
    const [refRes, invRes] = await Promise.all([
      supabase.from("ingredient_reference").select("*").order("canonical_name", { ascending: true }),
      supabase.from("inventory_items").select("id,name,unit").order("name", { ascending: true }),
    ]);
    if (refRes.error) toast.error(refRes.error.message);
    if (invRes.error) toast.error(invRes.error.message);
    const refs = (refRes.data ?? []) as RefRow[];
    setInventory((invRes.data ?? []) as InventoryItem[]);
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
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

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
            return (
              <Card key={row.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-4">
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
    </div>
  );
}
