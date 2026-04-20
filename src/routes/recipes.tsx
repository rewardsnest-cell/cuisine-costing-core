import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isCocktail, type RecipeKind } from "@/lib/recipe-kind";
import { RecipePlaceholder } from "@/components/RecipePlaceholder";
import { Input } from "@/components/ui/input";
import { Search, Clock, Users, ChefHat, Heart, ShoppingBasket, Sparkles } from "lucide-react";
import { PhotoGrid } from "@/components/PhotoGrid";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  hook: string | null;
  image_url: string | null;
  category: string | null;
  cuisine: string | null;
  use_case: string | null;
  video_url: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  serving_size: string | null;
  skill_level: string | null;
  is_vegetarian: boolean | null;
  is_vegan: boolean | null;
  is_gluten_free: boolean | null;
  selling_price_per_person: number | null;
  calculated_cost_per_person: number | null;
  is_copycat: boolean | null;
  copycat_source: string | null;
};

type Ingredient = { recipe_id: string; name: string };

const USE_CASES = ["All", "Home", "Party", "Wedding", "Holiday", "Catering"] as const;
const DIETARY = ["Vegetarian", "Vegan", "Gluten-Free"] as const;
type UseCaseFilter = typeof USE_CASES[number];
type Diet = typeof DIETARY[number];

export const Route = createFileRoute("/recipes")({
  head: () => ({
    meta: [
      { title: "Recipes — VPS Finest, Aurora Ohio" },
      { name: "description", content: "A small, growing library of calm, reliable recipes from VPS Finest in Aurora, Ohio. Weeknight meals, make-ahead dishes, and food for gatherings." },
      { property: "og:title", content: "Recipes — VPS Finest" },
      { property: "og:description", content: "Calm, reliable recipes for everyday cooking and gatherings." },
    ],
  }),
  component: RecipesPage,
});

function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<RecipeKind>("food");
  const [useCase, setUseCase] = useState<UseCaseFilter>("All");
  const [diets, setDiets] = useState<Set<Diet>>(new Set());
  const [cuisine, setCuisine] = useState<string>("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const { data: rs } = await (supabase as any)
        .from("recipes")
        .select("id, name, description, hook, image_url, category, cuisine, use_case, video_url, prep_time, cook_time, servings, skill_level, is_vegetarian, is_vegan, is_gluten_free")
        .eq("active", true)
        .order("name");
      const list: Recipe[] = rs || [];
      setRecipes(list);
      // Pull ingredients for ingredient search (all in one shot)
      if (list.length) {
        const { data: ings } = await (supabase as any)
          .from("recipe_ingredients")
          .select("recipe_id, name")
          .in("recipe_id", list.map((r) => r.id));
        const map = new Map<string, string[]>();
        for (const i of (ings || []) as Ingredient[]) {
          if (!map.has(i.recipe_id)) map.set(i.recipe_id, []);
          map.get(i.recipe_id)!.push((i.name || "").toLowerCase());
        }
        setIngredients(map);
      }
      setLoading(false);
    })();
  }, []);

  const cuisineOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of recipes) if (r.cuisine) s.add(r.cuisine);
    return ["All", ...Array.from(s).sort()];
  }, [recipes]);

  const counts = useMemo(() => {
    let cocktail = 0, food = 0;
    for (const r of recipes) (isCocktail(r.category) ? cocktail++ : food++);
    return { food, cocktail };
  }, [recipes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      const matchKind = kind === "cocktail" ? isCocktail(r.category) : !isCocktail(r.category);
      if (!matchKind) return false;
      if (useCase !== "All") {
        const uc = (r.use_case || "").toLowerCase();
        if (!uc.includes(useCase.toLowerCase())) return false;
      }
      if (cuisine !== "All" && r.cuisine !== cuisine) return false;
      if (diets.has("Vegetarian") && !r.is_vegetarian) return false;
      if (diets.has("Vegan") && !r.is_vegan) return false;
      if (diets.has("Gluten-Free") && !r.is_gluten_free) return false;
      if (q) {
        const inName = r.name.toLowerCase().includes(q);
        const inDesc = (r.description || "").toLowerCase().includes(q);
        const ings = ingredients.get(r.id) || [];
        const inIngs = ings.some((n) => n.includes(q));
        if (!inName && !inDesc && !inIngs) return false;
      }
      return true;
    });
  }, [recipes, kind, useCase, cuisine, diets, query, ingredients]);

  const toggleDiet = (d: Diet) =>
    setDiets((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  const clearAll = () => {
    setUseCase("All");
    setDiets(new Set());
    setCuisine("All");
    setQuery("");
  };

  const filtersActive = useCase !== "All" || diets.size > 0 || cuisine !== "All" || query.trim().length > 0;

  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-12 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Recipes</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            Cook calmly.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            A small, growing library of reliable recipes from our kitchen in Aurora, Ohio — the ones we cook on weeknights and bring to gatherings.
          </p>
        </div>
      </section>

      <section className="pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="max-w-md mx-auto mb-8 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by title or ingredient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Food / Cocktails toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm">
            {(["food", "cocktail"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-5 py-1.5 rounded-full transition-colors capitalize ${
                  kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "food" ? "Food" : "Cocktails"}{" "}
                <span className="opacity-70 ml-1">({k === "food" ? counts.food : counts.cocktail})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Occasion */}
        <div className="flex flex-wrap justify-center gap-2 mb-3 text-xs">
          <span className="text-muted-foreground self-center mr-1">Occasion:</span>
          {USE_CASES.map((u) => (
            <button
              key={u}
              onClick={() => setUseCase(u)}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                useCase === u ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Dietary */}
        <div className="flex flex-wrap justify-center gap-2 mb-3 text-xs">
          <span className="text-muted-foreground self-center mr-1">Dietary:</span>
          {DIETARY.map((d) => (
            <button
              key={d}
              onClick={() => toggleDiet(d)}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                diets.has(d) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Cuisine */}
        {cuisineOptions.length > 2 && (
          <div className="flex flex-wrap justify-center gap-2 mb-8 text-xs">
            <span className="text-muted-foreground self-center mr-1">Cuisine:</span>
            {cuisineOptions.map((c) => (
              <button
                key={c}
                onClick={() => setCuisine(c)}
                className={`px-3 py-1.5 rounded-full border transition-colors ${
                  cuisine === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {filtersActive && (
          <div className="text-center mb-8">
            <button onClick={clearAll} className="text-xs text-primary hover:underline">
              Clear all filters
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground">Loading recipes…</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 max-w-md mx-auto">
            <p className="text-muted-foreground mb-4">
              No {kind === "cocktail" ? "cocktails" : "food recipes"} match these filters yet — try broadening them!
            </p>
            {filtersActive && (
              <button onClick={clearAll} className="text-sm text-primary underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {visible.map((r) => {
              const total = (r.prep_time || 0) + (r.cook_time || 0);
              return (
                <Link key={r.id} to="/recipes/$id" params={{ id: r.id }} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <RecipePlaceholder />
                    )}
                    {r.video_url && (
                      <span className="absolute top-3 right-3 text-[10px] tracking-widest uppercase bg-background/90 text-foreground px-2 py-1 rounded-full">Video</span>
                    )}
                  </div>
                  <div className="pt-5 text-center">
                    {(r.category || r.cuisine) && (
                      <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
                        {[r.category, r.cuisine].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <h3 className="font-display text-xl font-bold text-foreground group-hover:text-accent transition-colors">{r.name}</h3>
                    {r.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2 max-w-xs mx-auto leading-relaxed">{r.description}</p>
                    )}
                    {(total > 0 || r.servings || r.skill_level) && (
                      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                        {total > 0 && (
                          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{total}m</span>
                        )}
                        {r.servings != null && (
                          <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{r.servings}</span>
                        )}
                        {r.skill_level && (
                          <span className="inline-flex items-center gap-1 capitalize"><ChefHat className="w-3 h-3" />{r.skill_level}</span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <PhotoGrid heading="More from the kitchen" subhead="A small look at the food we've been cooking and serving lately." />

      <section className="py-20 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6">
          <NewsletterSignup source="recipes_page" />
        </div>
      </section>
    </div>
  );
}
