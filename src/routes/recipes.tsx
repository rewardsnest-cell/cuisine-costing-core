import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isCocktail, type RecipeKind } from "@/lib/recipe-kind";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  cuisine: string | null;
};

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

  useEffect(() => {
    (supabase as any)
      .from("recipes")
      .select("id, name, description, image_url, category, cuisine")
      .eq("active", true)
      .order("name")
      .then(({ data }: any) => {
        setRecipes(data || []);
        setLoading(false);
      });
  }, []);

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
        {loading ? (
          <p className="text-center text-muted-foreground">Loading recipes…</p>
        ) : recipes.length === 0 ? (
          <p className="text-center text-muted-foreground">No recipes yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {recipes.map((r) => (
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
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs tracking-widest uppercase">No photo</div>
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
