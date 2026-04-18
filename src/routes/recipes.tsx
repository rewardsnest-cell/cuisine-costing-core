import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { supabase } from "@/integrations/supabase/client";

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
      { title: "Recipes — VPS Finest" },
      { name: "description", content: "Calm, reliable recipes for everyday cooking. Browse our seasonal collection." },
      { property: "og:title", content: "Recipes — VPS Finest" },
      { property: "og:description", content: "Calm, reliable recipes for everyday cooking." },
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
      <PublicHeader />
      <section className="pt-24 pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-primary text-xs tracking-widest uppercase mb-3">Recipes</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-4">Cook calmly.</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Reliable recipes that work the first time. Updated as we cook them.
        </p>
      </section>

      <section className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {loading ? (
          <p className="text-muted-foreground">Loading recipes…</p>
        ) : recipes.length === 0 ? (
          <p className="text-muted-foreground">No recipes yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((r) => (
              <Link
                key={r.id}
                to="/recipes/$id" as any
                params={{ id: r.id } as any}
                className="block bg-card rounded-xl overflow-hidden border border-border hover:shadow-warm transition-shadow"
              >
                <div className="aspect-[4/3] bg-secondary overflow-hidden">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No photo</div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-semibold text-primary">{r.name}</h3>
                  {r.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                  )}
                  <div className="flex gap-2 mt-3 text-xs text-muted-foreground">
                    {r.category && <span>{r.category}</span>}
                    {r.cuisine && <span>· {r.cuisine}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <PublicFooter />
    </div>
  );
}
