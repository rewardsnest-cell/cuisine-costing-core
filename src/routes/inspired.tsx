import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RecipeEmailCTA } from "@/components/recipes/RecipeEmailCTA";

const SITE = "https://www.vpsfinest.com";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  hook: string | null;
  image_url: string | null;
  category: string | null;
  cuisine: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  video_url: string | null;
};

export const Route = createFileRoute("/inspired")({
  head: () => ({
    meta: [
      { title: "Inspired / Familiar Favorites — VPS Finest" },
      { name: "description", content: "A small, growing collection of home-cook recipes inspired by familiar flavors. Calm, reliable, and easy to follow at home." },
      { property: "og:title", content: "Inspired / Familiar Favorites — VPS Finest" },
      { property: "og:description", content: "Home-cook recipes inspired by familiar flavors. Two new recipes a week, each paired with a short video." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE}/inspired` },
    ],
    links: [{ rel: "canonical", href: `${SITE}/inspired` }],
  }),
  component: InspiredLanding,
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background pt-32 pb-20 max-w-3xl mx-auto px-6 space-y-3">
      <h1 className="font-display text-3xl text-primary">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">{error.message}</p>
      <Link to="/recipes"><Button variant="outline">Back to all recipes</Button></Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background pt-32 pb-20 max-w-3xl mx-auto px-6 space-y-3">
      <h1 className="font-display text-3xl text-primary">Not found</h1>
      <Link to="/recipes"><Button>Back to all recipes</Button></Link>
    </div>
  ),
});

function InspiredLanding() {
  return (
    <FeatureGate featureKey="inspired" label="Inspired">
      <InspiredLandingInner />
    </FeatureGate>
  );
}

function InspiredLandingInner() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("recipes")
          .select("id, name, description, hook, image_url, category, cuisine, prep_time, cook_time, servings, video_url")
          .eq("inspired", true)
          .eq("inspired_phase", "public")
          .eq("status", "published")
          .eq("active", true)
          .order("name");
        if (error) throw error;
        if (!cancelled) setRecipes((data || []) as Recipe[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load recipes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-10 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Inspired / Familiar Favorites</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            Recipes inspired by familiar flavors.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            A small collection of home-cook recipes built around flavors you already love. Calm methods, simple equipment, and the occasional video to walk you through it.
          </p>
          <p className="mt-3 text-xs text-muted-foreground/80 max-w-xl mx-auto">
            These dishes are inspired by familiar flavors. They are original recipes and not official replicas.
          </p>
        </div>
      </section>

      <section className="pb-12 max-w-3xl mx-auto px-4 sm:px-6">
        <RecipeEmailCTA recipeId="" recipeName="Inspired / Familiar Favorites" />
      </section>

      <section className="pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {loading ? (
          <p className="text-center text-muted-foreground">Loading recipes…</p>
        ) : error ? (
          <p className="text-center text-muted-foreground text-sm">{error}</p>
        ) : recipes.length === 0 ? (
          <div className="text-center max-w-md mx-auto py-12">
            <p className="text-muted-foreground mb-2">First recipes coming soon.</p>
            <p className="text-xs text-muted-foreground/80">We're starting with two recipes a week, each paired with a short video.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-16">
            {recipes.map((r) => {
              const total = (r.prep_time || 0) + (r.cook_time || 0);
              return (
                <Link key={r.id} to="/recipes/$id" params={{ id: r.id }} className="group block">
                  <div className="aspect-[4/3] bg-secondary rounded-xl overflow-hidden mb-4">
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : null}
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-primary mb-1">
                    {r.category || r.cuisine || "Inspired"}
                  </p>
                  <h2 className="font-display text-xl text-foreground group-hover:text-primary transition-colors">
                    {r.name}
                  </h2>
                  {r.hook && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.hook}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {total > 0 ? `${total} min` : ""}{r.servings ? ` · serves ${r.servings}` : ""}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-16 text-center text-xs text-muted-foreground max-w-md mx-auto">
          Two new recipes a week. Each one tested in our kitchen and paired with a short video.
        </p>
      </section>
    </div>
  );
}
