import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Plus, Trash2, Eye, Pencil, Save, X } from "lucide-react";

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

type CateringRecipe = { id: string; name: string };

const STATE_VARIANT: Record<ModuleState, "default" | "secondary" | "outline"> = {
  active: "default",
  seasonal: "secondary",
  inactive: "outline",
};

function MenuModulesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; state: ModuleState }>({
    name: "",
    description: "",
    state: "active",
  });
  const [newName, setNewName] = useState("");

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

  const recipesQ = useQuery({
    queryKey: ["admin-catering-internal-recipes"],
    queryFn: async (): Promise<CateringRecipe[]> => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name")
        .eq("scope", "catering_internal")
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

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Menu Modules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal grouping of <span className="font-medium">catering_internal</span> recipes.
            Not public. Not connected to pricing or quotes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/menu-modules/preview">
            <Eye className="h-4 w-4 mr-2" /> Internal Preview
          </Link>
        </Button>
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

      {modulesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (modulesQ.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No modules yet. Create your first one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(modulesQ.data ?? []).map((m, idx, arr) => {
            const items = (itemsQ.data ?? []).filter((i) => i.module_id === m.id);
            const used = new Set(items.map((i) => i.recipe_id));
            const available = (recipesQ.data ?? []).filter((r) => !used.has(r.id));
            const isEditing = editingId === m.id;
            return (
              <Card key={m.id}>
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
                        disabled={idx === 0}
                        onClick={() => reorderModule.mutate({ id: m.id, dir: -1 })}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={idx === arr.length - 1}
                        onClick={() => reorderModule.mutate({ id: m.id, dir: 1 })}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              updateModule.mutate({
                                id: m.id,
                                patch: {
                                  name: draft.name.trim(),
                                  description: draft.description.trim() || null,
                                  state: draft.state,
                                },
                              })
                            }
                            aria-label="Save"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost" onClick={() => startEdit(m)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete module "${m.name}"? Recipe assignments will be removed.`)) {
                            deleteModule.mutate(m.id);
                          }
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No recipes assigned.</p>
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                      {items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between p-3">
                          <span className="text-sm">{it.recipes?.name ?? "(missing recipe)"}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeItem.mutate(it.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center gap-2">
                    <Select
                      onValueChange={(recipeId) => addItem.mutate({ moduleId: m.id, recipeId })}
                      value=""
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue
                          placeholder={
                            available.length === 0
                              ? "All catering recipes already assigned"
                              : "Add catering_internal recipe…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
