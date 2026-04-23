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
import { usePricingVisibility } from "@/lib/use-pricing-visibility";

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
  cost_per_serving: number | null;
  total_cost: number | null;
  is_copycat: boolean | null;
  copycat_source: string | null;
};

type Ingredient = { recipe_id: string; name: string; inventory_item_id: string | null; reference_id: string | null };
type Coverage = { linked: number; total: number };

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
  const { showPricing } = usePricingVisibility();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Map<string, string[]>>(new Map());
  const [coverage, setCoverage] = useState<Map<string, Coverage>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<RecipeKind>("food");
  const [useCase, setUseCase] = useState<UseCaseFilter>("All");
  const [diets, setDiets] = useState<Set<Diet>>(new Set());
  const [cuisine, setCuisine] = useState<string>("All");
  const [showAllCuisines, setShowAllCuisines] = useState(false);
  const [query, setQuery] = useState("");

  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const loadRecipes = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { data: rs, error: recipesError } = await (supabase as any)
          .from("recipes")
          .select("id, name, description, hook, image_url, category, cuisine, use_case, video_url, prep_time, cook_time, servings, serving_size, skill_level, is_vegetarian, is_vegan, is_gluten_free, selling_price_per_person, calculated_cost_per_person, cost_per_serving, total_cost, is_copycat, copycat_source")
          .eq("active", true)
          .order("name");

        if (recipesError) throw recipesError;

        const list: Recipe[] = rs || [];
        if (cancelled) return;
        setRecipes(list);

        if (!list.length) {
          setIngredients(new Map());
          setCoverage(new Map());
          return;
        }

        const { data: ings, error: ingredientsError } = await (supabase as any)
          .from("recipe_ingredients")
          .select("recipe_id, name, inventory_item_id, reference_id")
          .in("recipe_id", list.map((r) => r.id));

        if (ingredientsError) throw ingredientsError;
        if (cancelled) return;

        const map = new Map<string, string[]>();
        const cov = new Map<string, Coverage>();
        for (const i of (ings || []) as Ingredient[]) {
          if (!map.has(i.recipe_id)) map.set(i.recipe_id, []);
          map.get(i.recipe_id)!.push((i.name || "").toLowerCase());
          const c = cov.get(i.recipe_id) || { linked: 0, total: 0 };
          c.total += 1;
          if (i.inventory_item_id || i.reference_id) c.linked += 1;
          cov.set(i.recipe_id, c);
        }
        setIngredients(map);
        setCoverage(cov);
      } catch (error: any) {
        if (cancelled) return;
        setRecipes([]);
        setIngredients(new Map());
        setCoverage(new Map());
        setLoadError(error?.message || "Could not load recipes right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadRecipes();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load favorites for signed-in users
  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", user.id);
      setFavorites(new Set(((data || []) as { recipe_id: string }[]).map((x) => x.recipe_id)));
    })();
  }, [user]);

  const toggleFavorite = async (recipeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Sign in to save favorites", { description: "Free account — takes 10 seconds." });
      return;
    }
    const isFav = favorites.has(recipeId);
    setFavorites((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(recipeId) : next.add(recipeId);
      return next;
    });
    if (isFav) {
      await (supabase as any).from("recipe_favorites").delete().eq("user_id", user.id).eq("recipe_id", recipeId);
      toast("Removed from favorites");
    } else {
      const { error } = await (supabase as any).from("recipe_favorites").insert({ user_id: user.id, recipe_id: recipeId });
      if (error) {
        // revert on error
        setFavorites((prev) => { const next = new Set(prev); next.delete(recipeId); return next; });
        toast.error("Couldn't save favorite");
      } else {
        toast.success("Saved to favorites");
      }
    }
  };

  const quickAddToShoppingList = async (recipe: Recipe, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { data: ings, error: ingredientsError } = await (supabase as any)
      .from("recipe_ingredients")
      .select("name, quantity, unit, notes")
      .eq("recipe_id", recipe.id);

    if (ingredientsError) {
      toast.error("Couldn't load ingredients for this recipe");
      return;
    }

    const list = (ings || []) as Array<{ name: string; quantity: number | null; unit: string | null; notes?: string | null }>;
    if (!list.length) {
      toast("No ingredients to add");
      return;
    }

    if (user) {
      const rows = list.map((i) => ({
        user_id: user.id,
        recipe_id: recipe.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes ? `${recipe.name}: ${i.notes}` : recipe.name,
      }));
      const { error } = await (supabase as any).from("shopping_list_items").insert(rows);
      if (error) {
        toast.error("Couldn't add to shopping list");
      } else {
        toast.success(`Added ${rows.length} ingredient${rows.length === 1 ? "" : "s"}`, { description: recipe.name });
      }
      return;
    }

    const KEY = "shopping_list_local_v1";
    const existing = (() => {
      try {
        return JSON.parse(localStorage.getItem(KEY) || "[]");
      } catch {
        return [];
      }
    })();

    const additions = list.map((i) => ({
      id: crypto.randomUUID(),
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      notes: i.notes || null,
      checked: false,
      created_at: new Date().toISOString(),
    }));

    localStorage.setItem(KEY, JSON.stringify([...existing, ...additions]));
    toast.success(`Added ${additions.length} item${additions.length === 1 ? "" : "s"} to your list`, {
      description: "Sign in to sync your shopping list across devices.",
    });
  };

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

      {/* Lead magnet banner — turns recipe browsing into email capture */}
      <section className="pb-10 max-w-3xl mx-auto px-4 sm:px-6">
        <NewsletterSignup source="recipes_page_top" />
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

        {/* Cuisine — collapsed by default to keep the page calm */}
        {cuisineOptions.length > 2 && (
          <div className="flex flex-wrap justify-center gap-2 mb-8 text-xs">
            <span className="text-muted-foreground self-center mr-1">Cuisine:</span>
            {(showAllCuisines ? cuisineOptions : cuisineOptions.slice(0, 7)).map((c) => (
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
            {cuisineOptions.length > 7 && (
              <button
                onClick={() => setShowAllCuisines((v) => !v)}
                className="px-3 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAllCuisines ? "Show less" : `+${cuisineOptions.length - 7} more`}
              </button>
            )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-20">
            {visible.map((r) => {
              const total = (r.prep_time || 0) + (r.cook_time || 0);
              const price = Number(r.selling_price_per_person || 0);
              const perPersonCost = Number(r.calculated_cost_per_person || r.cost_per_serving || 0);
              const totalCost = Number(r.total_cost || (perPersonCost * (r.servings || 0)) || 0);
              const isFav = favorites.has(r.id);
              const cov = coverage.get(r.id);
              const fullyCosted = cov && cov.total > 0 && cov.linked === cov.total;
              const partial = cov && cov.total > 0 && cov.linked > 0 && cov.linked < cov.total;
              return (
                <article key={r.id} className="group">
                  <div className="relative">
                    <Link to="/recipes/$id" params={{ id: r.id }} className="block rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                      <div className="relative aspect-[4/5] overflow-hidden bg-muted rounded-md shadow-sm group-hover:shadow-md transition-shadow duration-500">
                        {r.image_url ? (
                          <img
                            src={r.image_url}
                            alt={r.name}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <RecipePlaceholder />
                        )}
                        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-500" />
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                          {r.is_copycat && (
                            <span className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase bg-accent/90 text-accent-foreground px-2 py-1 rounded-full">
                              <Sparkles className="w-3 h-3" /> Copycat
                            </span>
                          )}
                          {r.video_url && (
                            <span className="text-[10px] tracking-widest uppercase bg-background/90 text-foreground px-2 py-1 rounded-full">Video</span>
                          )}
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
                      aria-pressed={isFav}
                      onClick={(e) => toggleFavorite(r.id, e)}
                      className={`absolute top-3 right-3 z-10 w-9 h-9 inline-flex items-center justify-center rounded-full bg-background/90 backdrop-blur-sm shadow-sm transition-colors hover:bg-background ${isFav ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
                    </button>
                  </div>
                  <div className="pt-7 text-center">
                    {(r.category || r.cuisine) && (
                      <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-3">
                        {[r.category, r.cuisine].filter(Boolean).join(" · ")}
                        {r.is_copycat && r.copycat_source && <span className="ml-2 normal-case tracking-normal">· inspired by {r.copycat_source}</span>}
                      </p>
                    )}
                    <Link to="/recipes/$id" params={{ id: r.id }} className="inline-block">
                      <h3 className="font-display text-2xl font-bold text-foreground group-hover:text-accent transition-colors duration-300">{r.name}</h3>
                    </Link>
                    {r.description && (
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2 max-w-xs mx-auto leading-relaxed font-light">{r.description}</p>
                    )}
                    {(total > 0 || r.servings || r.skill_level) && (
                      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                        {total > 0 && (
                          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{total}m</span>
                        )}
                        {r.servings != null && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />Serves {r.servings}
                            {r.serving_size ? <span className="text-muted-foreground/70"> · {r.serving_size}</span> : null}
                          </span>
                        )}
                        {r.skill_level && (
                          <span className="inline-flex items-center gap-1 capitalize"><ChefHat className="w-3 h-3" />{r.skill_level}</span>
                        )}
                      </div>
                    )}
                    {showPricing && (totalCost > 0 || perPersonCost > 0) && (
                      <p
                        className="mt-4 text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5"
                        title={
                          cov
                            ? `${cov.linked}/${cov.total} ingredients linked to inventory${fullyCosted ? "" : " — total may be incomplete"}`
                            : undefined
                        }
                      >
                        {totalCost > 0 && (
                          <span className="font-medium text-foreground">${totalCost.toFixed(2)} total</span>
                        )}
                        {totalCost > 0 && perPersonCost > 0 && <span className="mx-1">·</span>}
                        {perPersonCost > 0 && <span>${perPersonCost.toFixed(2)} per person</span>}
                        {cov && cov.total > 0 && (
                          <span
                            className={`ml-1 inline-flex items-center justify-center w-2 h-2 rounded-full ${
                              fullyCosted ? "bg-success" : partial ? "bg-gold" : "bg-muted-foreground/40"
                            }`}
                            aria-label={`${cov.linked} of ${cov.total} ingredients priced`}
                          />
                        )}
                      </p>
                    )}
                    {showPricing && price > 0 && (
                      <p className="mt-2 font-display text-base font-semibold text-foreground">
                        ${price.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">catering price / person</span>
                      </p>
                    )}
                    <div className="mt-6 flex items-center justify-center gap-2">
                      <Link
                        to="/recipes/$id"
                        params={{ id: r.id }}
                        className="text-xs px-5 py-2.5 rounded-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity tracking-wide font-semibold"
                      >
                        View recipe
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => quickAddToShoppingList(r, e)}
                        className="relative z-10 text-xs px-5 py-2.5 rounded-sm border border-foreground/30 text-foreground hover:bg-foreground hover:text-background transition-colors inline-flex items-center gap-1 font-semibold tracking-wide"
                        aria-label={`Add ${r.name} ingredients to shopping list`}
                      >
                        <ShoppingBasket className="w-3 h-3" /> Add to list
                      </button>
                    </div>
                  </div>
                </article>
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
