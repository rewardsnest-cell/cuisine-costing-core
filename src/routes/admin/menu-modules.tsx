import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Plus, Trash2, Eye, Pencil, Save, X, Search, Download, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/admin/menu-modules")({
  head: () => ({
    meta: [{ title: "Menu Modules — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: MenuModulesPage,
});

type ModuleState = "active" | "seasonal" | "inactive";

type MenuModule = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  state: ModuleState;
};

type ModuleItem = {
  id: string;
  module_id: string;
  recipe_id: string;
  position: number;
  recipes: { id: string; name: string; scope: string; active: boolean } | null;
};

type CateringRecipe = { id: string; name: string; scope: string };

const STATE_VARIANT: Record<ModuleState, "default" | "secondary" | "outline"> = {
  active: "default",
  seasonal: "secondary",
  inactive: "outline",
};

type ModuleSort = "position" | "name" | "state";

function MenuModulesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; state: ModuleState }>({
    name: "",
    description: "",
    state: "active",
  });
  const [newName, setNewName] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleSort, setModuleSort] = useState<ModuleSort>("position");

  const modulesQ = useQuery({
    queryKey: ["admin-menu-modules"],
    queryFn: async (): Promise<MenuModule[]> => {
      const { data, error } = await supabase
        .from("menu_modules")
        .select("id, name, description, position, state")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MenuModule[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["admin-menu-module-items"],
    queryFn: async (): Promise<ModuleItem[]> => {
      const { data, error } = await supabase
        .from("menu_module_items")
        .select("id, module_id, recipe_id, position, recipes(id, name, scope, active)")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ModuleItem[];
    },
  });

  // Fetch ALL recipes (not filtered by scope) so we can validate eligibility client-side
  const recipesQ = useQuery({
    queryKey: ["admin-all-active-recipes"],
    queryFn: async (): Promise<CateringRecipe[]> => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, scope")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CateringRecipe[];
    },
  });

  const createModule = useMutation({
    mutationFn: async (name: string) => {
      const max = (modulesQ.data ?? []).reduce((m, x) => Math.max(m, x.position), -1);
      const { error } = await supabase
        .from("menu_modules")
        .insert({ name: name.trim(), position: max + 1, state: "active" });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["admin-menu-modules"] });
      toast.success("Module created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateModule = useMutation({
    mutationFn: async (m: { id: string; patch: Partial<MenuModule> }) => {
      const { error } = await supabase.from("menu_modules").update(m.patch).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["admin-menu-modules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteModule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-menu-modules"] });
      qc.invalidateQueries({ queryKey: ["admin-menu-module-items"] });
      toast.success("Module deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderModule = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const list = [...(modulesQ.data ?? [])].sort((a, b) => a.position - b.position);
      const idx = list.findIndex((x) => x.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= list.length) return;
      const a = list[idx];
      const b = list[swap];
      const { error: e1 } = await supabase.from("menu_modules").update({ position: b.position }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("menu_modules").update({ position: a.position }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-menu-modules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: async ({ moduleId, recipeId }: { moduleId: string; recipeId: string }) => {
      // Client-side eligibility check
      const recipe = (recipesQ.data ?? []).find((r) => r.id === recipeId);
      if (!recipe) throw new Error("Recipe not found.");
      if (recipe.scope !== "catering_internal") {
        throw new Error(
          `"${recipe.name}" is not eligible — only catering_internal recipes can be added to menu modules (scope: ${recipe.scope}).`,
        );
      }
      const existing = (itemsQ.data ?? []).filter((i) => i.module_id === moduleId);
      const max = existing.reduce((m, x) => Math.max(m, x.position), -1);
      const { error } = await supabase
        .from("menu_module_items")
        .insert({ module_id: moduleId, recipe_id: recipeId, position: max + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-menu-module-items"] });
      toast.success("Recipe added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_module_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-menu-module-items"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (m: MenuModule) => {
    setEditingId(m.id);
    setDraft({ name: m.name, description: m.description ?? "", state: m.state });
  };

  // Filter + sort modules for display
  const visibleModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    let list = (modulesQ.data ?? []).filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q)
      );
    });
    if (moduleSort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (moduleSort === "state") {
      const order: Record<ModuleState, number> = { active: 0, seasonal: 1, inactive: 2 };
      list = [...list].sort((a, b) => order[a.state] - order[b.state] || a.position - b.position);
    } else {
      list = [...list].sort((a, b) => a.position - b.position);
    }
    return list;
  }, [modulesQ.data, moduleSearch, moduleSort]);

  // CSV export
  const handleExportCsv = () => {
    const modules = modulesQ.data ?? [];
    const items = itemsQ.data ?? [];
    const escape = (v: string | number | null | undefined) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const rows: string[] = [
      ["module_id", "module_name", "module_state", "module_position", "recipe_id", "recipe_name", "recipe_scope", "recipe_position"]
        .join(","),
    ];
    const sortedModules = [...modules].sort((a, b) => a.position - b.position);
    for (const m of sortedModules) {
      const moduleItems = items
        .filter((i) => i.module_id === m.id)
        .sort((a, b) => a.position - b.position);
      if (moduleItems.length === 0) {
        rows.push([
          m.id, m.name, m.state, m.position, "", "", "", "",
        ].map(escape).join(","));
      } else {
        for (const it of moduleItems) {
          rows.push([
            m.id, m.name, m.state, m.position,
            it.recipe_id, it.recipes?.name ?? "", it.recipes?.scope ?? "", it.position,
          ].map(escape).join(","));
        }
      }
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `menu-modules-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Menu Modules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal grouping of <span className="font-medium">catering_internal</span> recipes.
            Not public. Not connected to pricing or quotes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/menu-modules/preview">
              <Eye className="h-4 w-4 mr-2" /> Internal Preview
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New module</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              createModule.mutate(newName);
            }}
          >
            <Input
              placeholder="e.g. Proteins, Sides, Salads"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" disabled={createModule.isPending || !newName.trim()}>
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules…"
            value={moduleSearch}
            onChange={(e) => setModuleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select value={moduleSort} onValueChange={(v) => setModuleSort(v as ModuleSort)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="position">Sort: Position</SelectItem>
              <SelectItem value="name">Sort: Name (A→Z)</SelectItem>
              <SelectItem value="state">Sort: State</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {modulesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleModules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {(modulesQ.data ?? []).length === 0
              ? "No modules yet. Create your first one above."
              : "No modules match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleModules.map((m) => {
            const positionOrdered = [...(modulesQ.data ?? [])].sort((a, b) => a.position - b.position);
            const idx = positionOrdered.findIndex((x) => x.id === m.id);
            const isFirst = idx === 0;
            const isLast = idx === positionOrdered.length - 1;
            const items = (itemsQ.data ?? []).filter((i) => i.module_id === m.id);
            const used = new Set(items.map((i) => i.recipe_id));
            const eligible = (recipesQ.data ?? []).filter(
              (r) => r.scope === "catering_internal" && !used.has(r.id),
            );
            const isEditing = editingId === m.id;
            return (
              <ModuleCard
                key={m.id}
                module={m}
                items={items}
                eligibleRecipes={eligible}
                isEditing={isEditing}
                draft={draft}
                setDraft={setDraft}
                onStartEdit={() => startEdit(m)}
                onCancelEdit={() => setEditingId(null)}
                onSave={() =>
                  updateModule.mutate({
                    id: m.id,
                    patch: {
                      name: draft.name.trim(),
                      description: draft.description.trim() || null,
                      state: draft.state,
                    },
                  })
                }
                onMoveUp={() => reorderModule.mutate({ id: m.id, dir: -1 })}
                onMoveDown={() => reorderModule.mutate({ id: m.id, dir: 1 })}
                disableUp={isFirst || moduleSort !== "position"}
                disableDown={isLast || moduleSort !== "position"}
                onDelete={() => {
                  if (confirm(`Delete module "${m.name}"? Recipe assignments will be removed.`)) {
                    deleteModule.mutate(m.id);
                  }
                }}
                onAddRecipe={(rid) => addItem.mutate({ moduleId: m.id, recipeId: rid })}
                onRemoveItem={(id) => removeItem.mutate(id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type ModuleCardProps = {
  module: MenuModule;
  items: ModuleItem[];
  eligibleRecipes: CateringRecipe[];
  isEditing: boolean;
  draft: { name: string; description: string; state: ModuleState };
  setDraft: (d: { name: string; description: string; state: ModuleState }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  onDelete: () => void;
  onAddRecipe: (recipeId: string) => void;
  onRemoveItem: (id: string) => void;
};

function ModuleCard({
  module: m,
  items,
  eligibleRecipes,
  isEditing,
  draft,
  setDraft,
  onStartEdit,
  onCancelEdit,
  onSave,
  onMoveUp,
  onMoveDown,
  disableUp,
  disableDown,
  onDelete,
  onAddRecipe,
  onRemoveItem,
}: ModuleCardProps) {
  const [itemSearch, setItemSearch] = useState("");
  const [itemSort, setItemSort] = useState<"position" | "name">("position");
  const [recipeSearch, setRecipeSearch] = useState("");

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    let list = items.filter((it) => {
      if (!q) return true;
      return (it.recipes?.name ?? "").toLowerCase().includes(q);
    });
    if (itemSort === "name") {
      list = [...list].sort((a, b) =>
        (a.recipes?.name ?? "").localeCompare(b.recipes?.name ?? ""),
      );
    } else {
      list = [...list].sort((a, b) => a.position - b.position);
    }
    return list;
  }, [items, itemSearch, itemSort]);

  const filteredEligible = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    if (!q) return eligibleRecipes;
    return eligibleRecipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [eligibleRecipes, recipeSearch]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <Textarea
                  placeholder="Internal notes (optional)"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                />
                <Select
                  value={draft.state}
                  onValueChange={(v) => setDraft({ ...draft, state: v as ModuleState })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-lg">{m.name}</CardTitle>
                  <Badge variant={STATE_VARIANT[m.state]}>{m.state}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {items.length} {items.length === 1 ? "recipe" : "recipes"}
                  </span>
                </div>
                {m.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              disabled={disableUp}
              onClick={onMoveUp}
              aria-label="Move up"
              title={disableUp ? "Switch sort to Position to reorder" : "Move up"}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={disableDown}
              onClick={onMoveDown}
              aria-label="Move down"
              title={disableDown ? "Switch sort to Position to reorder" : "Move down"}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            {isEditing ? (
              <>
                <Button size="icon" variant="ghost" onClick={onSave} aria-label="Save">
                  <Save className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={onCancelEdit} aria-label="Cancel">
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="icon" variant="ghost" onClick={onStartEdit} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search assigned recipes…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={itemSort} onValueChange={(v) => setItemSort(v as "position" | "name")}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="position">Sort: Position</SelectItem>
                <SelectItem value="name">Sort: Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No recipes assigned.</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No assigned recipes match your search.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {visibleItems.map((it) => {
              const ineligible = it.recipes && it.recipes.scope !== "catering_internal";
              return (
                <li key={it.id} className="flex items-center justify-between p-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{it.recipes?.name ?? "(missing recipe)"}</span>
                    {ineligible && (
                      <Badge variant="destructive" className="text-[10px]">
                        ineligible: {it.recipes?.scope}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemoveItem(it.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-2 pt-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search catering_internal recipes to add…"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select
            onValueChange={(recipeId) => {
              onAddRecipe(recipeId);
              setRecipeSearch("");
            }}
            value=""
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  eligibleRecipes.length === 0
                    ? "All catering recipes already assigned"
                    : filteredEligible.length === 0
                      ? "No recipes match your search"
                      : `Add recipe (${filteredEligible.length} available)…`
                }
              />
            </SelectTrigger>
            <SelectContent>
              {filteredEligible.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Only recipes with scope = <code className="font-mono">catering_internal</code> are eligible.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
