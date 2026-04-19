import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteSelections, Step, SelectedRecipe } from "./types";
import { filterRecipesForSelections, pricePerGuestForRecipe, type RecipeRow } from "@/lib/quote-recipes";
import { isCocktail, type RecipeKind } from "@/lib/recipe-kind";

interface Props {
  selections: QuoteSelections;
  setSelections: React.Dispatch<React.SetStateAction<QuoteSelections>>;
  setStep: (s: Step) => void;
}

export function QuoteStepRecipes({ selections, setSelections, setStep }: Props) {
  const [allRecipes, setAllRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markup, setMarkup] = useState(3.0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: recipes }, { data: settings }] = await Promise.all([
        supabase
          .from("recipes")
          .select("id,name,description,category,cuisine,cost_per_serving,is_vegetarian,is_vegan,is_gluten_free,allergens,active")
          .eq("active", true)
          .order("category", { nullsFirst: false })
          .order("name"),
        supabase.from("app_settings").select("markup_multiplier").eq("id", 1).maybeSingle(),
      ]);
      setAllRecipes((recipes as RecipeRow[]) || []);
      if (settings?.markup_multiplier) setMarkup(Number(settings.markup_multiplier));
      setLoading(false);
    })();
  }, []);

  const matched = useMemo(
    () =>
      filterRecipesForSelections(allRecipes, {
        style: selections.style,
        proteins: selections.proteins,
        allergies: selections.allergies,
      }).filter((r) => (search.trim() ? r.name.toLowerCase().includes(search.toLowerCase()) : true)),
    [allRecipes, selections.style, selections.proteins, selections.allergies, search],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, RecipeRow[]>();
    matched.forEach((r) => {
      const key = r.category || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries());
  }, [matched]);

  const selectedIds = new Set((selections.recipes || []).map((r) => r.id));

  const toggleRecipe = (r: RecipeRow) => {
    setSelections((prev) => {
      const list = prev.recipes || [];
      if (list.find((x) => x.id === r.id)) {
        return { ...prev, recipes: list.filter((x) => x.id !== r.id) };
      }
      const sel: SelectedRecipe = {
        id: r.id,
        name: r.name,
        category: r.category,
        cost_per_serving: Number(r.cost_per_serving) || 0,
        servings_per_guest: 1,
      };
      return { ...prev, recipes: [...list, sel] };
    });
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Pick from Our Recipes</h1>
      <p className="text-muted-foreground mb-2">
        Curated to match your style, proteins, and dietary needs. Pricing uses real recipe costs ×{" "}
        {markup}x markup × your tier.
      </p>
      <p className="text-xs text-muted-foreground mb-6">
        Optional — you can skip and stay with the standard menu, or add chef-crafted dishes for a more accurate quote.
      </p>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading recipes...
        </div>
      ) : matched.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No recipes match your current style/protein/allergy choices. You can skip this step and continue with the standard menu.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {category} <span className="text-xs font-normal">({items.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((r) => {
                  const selected = selectedIds.has(r.id);
                  const perGuest = pricePerGuestForRecipe(r, markup, selections.tier || "silver");
                  return (
                    <Card
                      key={r.id}
                      onClick={() => toggleRecipe(r)}
                      className={`cursor-pointer transition-all ${
                        selected ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="font-semibold text-sm leading-snug">{r.name}</h4>
                          {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </div>
                        {r.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{r.description}</p>
                        )}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex flex-wrap gap-1">
                            {r.cuisine && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {r.cuisine}
                              </Badge>
                            )}
                            {r.is_vegan && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-success/40 text-success">
                                Vegan
                              </Badge>
                            )}
                            {r.is_vegetarian && !r.is_vegan && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Veg
                              </Badge>
                            )}
                            {r.is_gluten_free && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                GF
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-primary">
                            ${perGuest.toFixed(2)}
                            <span className="text-[10px] text-muted-foreground font-normal">/guest</span>
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={() => setStep("service")}>
          Back
        </Button>
        <Button
          onClick={() => setStep("extras")}
          className="bg-gradient-warm text-primary-foreground"
        >
          {selections.recipes && selections.recipes.length > 0
            ? `Continue with ${selections.recipes.length} recipe${selections.recipes.length > 1 ? "s" : ""}`
            : "Skip & Continue"}
        </Button>
      </div>
    </div>
  );
}
