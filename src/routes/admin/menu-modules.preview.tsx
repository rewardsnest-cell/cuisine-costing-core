import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Lock, Search, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/admin/menu-modules/preview")({
  head: () => ({
    meta: [{ title: "Menu Preview (Internal) — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: MenuPreviewPage,
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
  recipes: { id: string; name: string; description: string | null; active: boolean } | null;
};

const STATE_VARIANT: Record<ModuleState, "default" | "secondary" | "outline"> = {
  active: "default",
  seasonal: "secondary",
  inactive: "outline",
};

type SortMode = "position" | "name" | "state";

function MenuPreviewPage() {
  const [showActive, setShowActive] = useState(true);
  const [showSeasonal, setShowSeasonal] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("position");

  const modulesQ = useQuery({
    queryKey: ["admin-menu-modules"],
    queryFn: async (): Promise<MenuModule[]> => {
      const { data, error } = await supabase
        .from("menu_modules")
        .select("id, name, description, position, state")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MenuModule[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["admin-menu-module-items"],
    queryFn: async (): Promise<ModuleItem[]> => {
      const { data, error } = await supabase
        .from("menu_module_items")
        .select("id, module_id, recipe_id, position, recipes(id, name, description, active)")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ModuleItem[];
    },
  });

  const items = itemsQ.data ?? [];

  const visibleModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (modulesQ.data ?? []).filter((m) => {
      if (m.state === "active" && !showActive) return false;
      if (m.state === "seasonal" && !showSeasonal) return false;
      if (m.state === "inactive" && !showInactive) return false;
      if (!q) return true;
      const inName = m.name.toLowerCase().includes(q);
      const inDesc = (m.description ?? "").toLowerCase().includes(q);
      const inRecipe = items.some(
        (it) => it.module_id === m.id && (it.recipes?.name ?? "").toLowerCase().includes(q),
      );
      return inName || inDesc || inRecipe;
    });
    if (sort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "state") {
      const order: Record<ModuleState, number> = { active: 0, seasonal: 1, inactive: 2 };
      list = [...list].sort((a, b) => order[a.state] - order[b.state] || a.position - b.position);
    } else {
      list = [...list].sort((a, b) => a.position - b.position);
    }
    return list;
  }, [modulesQ.data, items, search, sort, showActive, showSeasonal, showInactive]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
        <Lock className="h-4 w-4 shrink-0" />
        <span>
          <strong>Internal Preview</strong> — admin-only. This view is not exposed publicly and has no
          pricing, totals, or quote integration.
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Menu Preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How modules and assigned recipes are structured today.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/menu-modules">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to manage
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search modules or recipes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="position">Sort: Position</SelectItem>
                  <SelectItem value="name">Sort: Name (A→Z)</SelectItem>
                  <SelectItem value="state">Sort: State</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap pt-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Show states:</span>
            <Label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={showActive} onCheckedChange={(v) => setShowActive(!!v)} />
              <Badge variant="default">active</Badge>
            </Label>
            <Label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={showSeasonal} onCheckedChange={(v) => setShowSeasonal(!!v)} />
              <Badge variant="secondary">seasonal</Badge>
            </Label>
            <Label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />
              <Badge variant="outline">inactive</Badge>
            </Label>
          </div>
        </CardContent>
      </Card>

      {modulesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleModules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {(modulesQ.data ?? []).length === 0
              ? "No modules to preview. Create some on the manage page."
              : "No modules match the current filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleModules.map((m) => {
            const moduleItems = items.filter((i) => i.module_id === m.id);
            const isInactive = m.state === "inactive";
            return (
              <Card key={m.id} className={isInactive ? "opacity-60" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-xl">{m.name}</CardTitle>
                    <Badge variant={STATE_VARIANT[m.state]}>{m.state}</Badge>
                  </div>
                  {m.description && (
                    <p className="text-sm text-muted-foreground">{m.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {moduleItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No recipes assigned.</p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {moduleItems.map((it) => (
                        <li
                          key={it.id}
                          className="rounded-md border border-border/60 bg-card p-3"
                        >
                          <div className="text-sm font-medium">
                            {it.recipes?.name ?? "(missing recipe)"}
                          </div>
                          {it.recipes?.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {it.recipes.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
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
