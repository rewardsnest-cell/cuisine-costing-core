import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/admin/pricing-lab/preview")({
  head: () => ({ meta: [{ title: "Pricing Preview — Admin" }] }),
  component: PricingPreviewPage,
});

type PricingModel = { id: string; name: string; status: string };
type ModelRecipe = {
  id: string;
  recipe_id: string;
  price_per_person: number;
};
type Recipe = {
  id: string;
  name: string;
  cost_per_serving: number | null;
};
type MenuModule = {
  id: string;
  name: string;
  state: "active" | "seasonal" | "inactive";
  position: number;
};
type ModuleItem = { id: string; module_id: string; recipe_id: string };

function PricingPreviewPage() {
  const [modelId, setModelId] = useState<string>("");
  const [guestCount, setGuestCount] = useState<number>(50);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());

  const { data: models = [] } = useQuery({
    queryKey: ["pricing-models-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_models")
        .select("id,name,status")
        .neq("status", "archived")
        .order("status")
        .order("name");
      if (error) throw error;
      return data as PricingModel[];
    },
  });

  const { data: modelRecipes = [] } = useQuery({
    queryKey: ["pricing-model-recipes-preview", modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_model_recipes")
        .select("id,recipe_id,price_per_person")
        .eq("pricing_model_id", modelId);
      if (error) throw error;
      return data as ModelRecipe[];
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["catering-recipes-preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id,name,cost_per_serving")
        .eq("scope", "catering_internal")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Recipe[];
    },
  });

  const { data: modules = [] } = useQuery({
    queryKey: ["menu-modules-preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_modules")
        .select("id,name,state,position")
        .order("position");
      if (error) throw error;
      return data as MenuModule[];
    },
  });

  const { data: moduleItems = [] } = useQuery({
    queryKey: ["menu-module-items-preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_module_items")
        .select("id,module_id,recipe_id");
      if (error) throw error;
      return data as ModuleItem[];
    },
  });

  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const priceMap = useMemo(
    () => new Map(modelRecipes.map((mr) => [mr.recipe_id, mr.price_per_person])),
    [modelRecipes],
  );

  const moduleGroups = useMemo(() => {
    return modules.map((m) => ({
      module: m,
      items: moduleItems
        .filter((mi) => mi.module_id === m.id)
        .map((mi) => recipeMap.get(mi.recipe_id))
        .filter((r): r is Recipe => !!r),
    }));
  }, [modules, moduleItems, recipeMap]);

  const toggleRecipe = (id: string) => {
    setSelectedRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const breakdown = useMemo(() => {
    const lines: { recipe: Recipe; price: number; cost: number; hasPrice: boolean }[] = [];
    let totalPrice = 0;
    let totalCost = 0;
    let missingPrices = 0;

    selectedRecipeIds.forEach((rid) => {
      const recipe = recipeMap.get(rid);
      if (!recipe) return;
      const price = priceMap.get(rid);
      const hasPrice = price !== undefined;
      const lineCost = (recipe.cost_per_serving ?? 0) * guestCount;
      const linePrice = (price ?? 0) * guestCount;
      if (!hasPrice) missingPrices++;
      totalPrice += linePrice;
      totalCost += lineCost;
      lines.push({
        recipe,
        price: price ?? 0,
        cost: recipe.cost_per_serving ?? 0,
        hasPrice,
      });
    });

    const margin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0;
    return { lines, totalPrice, totalCost, margin, missingPrices };
  }, [selectedRecipeIds, recipeMap, priceMap, guestCount]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/pricing-lab">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <h2 className="font-display text-2xl font-bold">Pricing Preview</h2>
          <Badge variant="outline">Internal Preview</Badge>
        </div>
      </div>

      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="p-3 text-sm">
          <strong>Internal preview only.</strong> Numbers below are informational. Nothing is saved as a quote and no public-facing pricing is changed.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Inputs</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Pricing Model</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.status === "active" && "· active"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Guest count</Label>
                <Input
                  type="number" min="1"
                  value={guestCount}
                  onChange={(e) => setGuestCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Totals</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Selected items" value={`${selectedRecipeIds.size}`} />
              <Row label="Guests" value={`${guestCount}`} />
              <div className="border-t my-2" />
              <Row label="Estimated cost" value={`$${breakdown.totalCost.toFixed(2)}`} muted />
              <Row label="Total price" value={`$${breakdown.totalPrice.toFixed(2)}`} bold />
              <Row label="Per guest" value={`$${(breakdown.totalPrice / guestCount).toFixed(2)}`} />
              <Row
                label="Gross margin"
                value={`${breakdown.margin.toFixed(1)}%`}
              />
              {breakdown.missingPrices > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                  {breakdown.missingPrices} item(s) have no price in this model — counted as $0.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {!modelId ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Pick a pricing model to begin.
            </CardContent></Card>
          ) : moduleGroups.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              No menu modules available.
            </CardContent></Card>
          ) : (
            moduleGroups.map(({ module: mod, items }) => (
              <Card key={mod.id} className={mod.state === "inactive" ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {mod.name}
                    <Badge variant={mod.state === "active" ? "default" : "outline"} className="text-xs">
                      {mod.state}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recipes in this module.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((r) => {
                        const price = priceMap.get(r.id);
                        const checked = selectedRecipeIds.has(r.id);
                        return (
                          <label
                            key={r.id}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleRecipe(r.id)} />
                            <span className="flex-1 text-sm">{r.name}</span>
                            <span className="text-sm tabular-nums">
                              {price !== undefined ? (
                                <>${price.toFixed(2)}<span className="text-muted-foreground text-xs">/pp</span></>
                              ) : (
                                <span className="text-muted-foreground text-xs">no price</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-base" : ""}`}>{value}</span>
    </div>
  );
}
