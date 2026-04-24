import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Lock } from "lucide-react";

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

function MenuPreviewPage() {
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

  const modules = modulesQ.data ?? [];
  const items = itemsQ.data ?? [];

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

      {modulesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No modules to preview. Create some on the manage page.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {modules.map((m) => {
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
