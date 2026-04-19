import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isCocktail, type RecipeKind } from "@/lib/recipe-kind";
import { RecipePlaceholder } from "@/components/RecipePlaceholder";

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
};

const USE_CASES = ["All", "Home", "Party", "Wedding", "Holiday", "Catering"] as const;
type UseCaseFilter = typeof USE_CASES[number];

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
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<RecipeKind>("food");
  const [useCase, setUseCase] = useState<UseCaseFilter>("All");

  useEffect(() => {
    (supabase as any)
      .from("recipes")
      .select("id, name, description, hook, image_url, category, cuisine, use_case, video_url")
      .eq("active", true)
      .order("name")
      .then(({ data }: any) => {
        setRecipes(data || []);
        setLoading(false);
      });
  }, []);

  const counts = useMemo(() => {
    let cocktail = 0;
    let food = 0;
    for (const r of recipes) (isCocktail(r.category) ? cocktail++ : food++);
    return { food, cocktail };
  }, [recipes]);

  const visible = useMemo(
    () =>
      recipes.filter((r) => {
        const matchKind = kind === "cocktail" ? isCocktail(r.category) : !isCocktail(r.category);
        if (!matchKind) return false;
        if (useCase !== "All") {
          const uc = (r.use_case || "").toLowerCase();
          if (!uc.includes(useCase.toLowerCase())) return false;
        }
        return true;
      }),
    [recipes, kind, useCase],
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Page heading */}
      <section className="pt-32 pb-16 text-center">
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
        {/* Food / Cocktails toggle */}
        <div className="flex justify-center mb-12">
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

        {/* Use case filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-12 text-xs">
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

        {loading ? (
          <p className="text-center text-muted-foreground">Loading recipes…</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 max-w-md mx-auto">
            <p className="text-muted-foreground mb-4">
              No {kind === "cocktail" ? "cocktails" : "food recipes"} match these filters yet — try broadening them!
            </p>
            {useCase !== "All" && (
              <button onClick={() => setUseCase("All")} className="text-sm text-primary underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {visible.map((r) => (
              <Link
                key={r.id}
                to="/recipes/$id"
                params={{ id: r.id }}
                className="group block"
              >
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
