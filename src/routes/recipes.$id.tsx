import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";

const SITE = "https://www.vpsfinest.com";

export const Route = createFileRoute("/recipes/$id")({
  loader: async ({ params }) => {
    const { data: recipe, error } = await (supabase as any)
      .from("recipes")
      .select(
        "id, name, description, image_url, category, cuisine, servings, prep_time, cook_time, instructions, allergens, is_vegetarian, is_vegan, is_gluten_free, active",
      )
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!recipe || recipe.active === false) throw notFound();

    const { data: ingredients } = await (supabase as any)
      .from("recipe_ingredients")
      .select("id, name, quantity, unit, notes")
      .eq("recipe_id", params.id)
      .order("name");

    // Related recipes: same category or cuisine, excluding current
    let related: any[] = [];
    if (recipe.category || recipe.cuisine) {
      const filters: string[] = [];
      if (recipe.category) filters.push(`category.eq.${recipe.category}`);
      if (recipe.cuisine) filters.push(`cuisine.eq.${recipe.cuisine}`);
      const { data: rel } = await (supabase as any)
        .from("recipes")
        .select("id, name, image_url, category, cuisine")
        .eq("active", true)
        .neq("id", params.id)
        .or(filters.join(","))
        .limit(6);
      related = rel || [];
    }

    return { recipe, ingredients: ingredients || [], related };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.recipe) return { meta: [{ title: "Recipe — VPS Finest" }] };
    const r = loaderData.recipe;
    const title = `${r.name} — VPS Finest`;
    const description =
      r.description ||
      `${r.name}${r.category ? ` · ${r.category}` : ""}${r.cuisine ? ` · ${r.cuisine}` : ""}. A reliable recipe from VPS Finest.`;
    const meta: any[] = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE}/recipes/${r.id}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (r.image_url) {
      meta.push({ property: "og:image", content: r.image_url });
      meta.push({ name: "twitter:image", content: r.image_url });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: `${SITE}/recipes/${r.id}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Recipe",
            name: r.name,
            description,
            image: r.image_url ? [r.image_url] : undefined,
            recipeCategory: r.category || undefined,
            recipeCuisine: r.cuisine || undefined,
            recipeYield: r.servings ? `${r.servings} servings` : undefined,
            prepTime: r.prep_time ? `PT${r.prep_time}M` : undefined,
            cookTime: r.cook_time ? `PT${r.cook_time}M` : undefined,
            suitableForDiet: [
              r.is_vegetarian && "https://schema.org/VegetarianDiet",
              r.is_vegan && "https://schema.org/VeganDiet",
              r.is_gluten_free && "https://schema.org/GlutenFreeDiet",
            ].filter(Boolean),
          }),
        },
      ],
    };
  },
  component: RecipeDetailPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="max-w-3xl mx-auto px-4 py-24 space-y-4">
          <h1 className="font-display text-3xl text-primary">Something went wrong</h1>
          <p className="text-muted-foreground">{error.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => router.invalidate()} variant="outline">Retry</Button>
            <Link to="/recipes"><Button>Back to recipes</Button></Link>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="max-w-3xl mx-auto px-4 py-24 space-y-4">
        <h1 className="font-display text-3xl text-primary">Recipe not found</h1>
        <p className="text-muted-foreground">It may have been removed or unpublished.</p>
        <Link to="/recipes"><Button>Back to recipes</Button></Link>
      </div>
      <PublicFooter />
    </div>
  ),
});

function RecipeDetailPage() {
  const { recipe, ingredients } = Route.useLoaderData();
  const r: any = recipe;
  const tags = [
    r.is_vegetarian && "Vegetarian",
    r.is_vegan && "Vegan",
    r.is_gluten_free && "Gluten-free",
  ].filter(Boolean) as string[];

  const steps = (r.instructions || "")
    .split(/\n+/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <article className="pt-24 pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="text-sm text-muted-foreground mb-6">
          <Link to="/recipes" className="hover:text-primary">Recipes</Link>
          <span className="mx-2">/</span>
          <span>{r.name}</span>
        </nav>

        <header className="mb-8">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
            {r.category && <span className="uppercase tracking-widest text-primary">{r.category}</span>}
            {r.cuisine && <span>· {r.cuisine}</span>}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-4">{r.name}</h1>
          {r.description && (
            <p className="text-lg text-muted-foreground max-w-2xl">{r.description}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-6 text-sm text-muted-foreground">
            {r.servings != null && <span><strong className="text-foreground">{r.servings}</strong> servings</span>}
            {r.prep_time != null && <span><strong className="text-foreground">{r.prep_time}m</strong> prep</span>}
            {r.cook_time != null && <span><strong className="text-foreground">{r.cook_time}m</strong> cook</span>}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {tags.map((t) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">{t}</span>
              ))}
            </div>
          )}
        </header>

        {r.image_url && (
          <div className="aspect-[16/9] bg-secondary rounded-2xl overflow-hidden mb-10">
            <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <aside className="lg:col-span-1">
            <h2 className="font-display text-2xl font-semibold text-primary mb-4">Ingredients</h2>
            {ingredients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No ingredients listed.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {ingredients.map((i: any) => (
                  <li key={i.id} className="flex gap-2 border-b border-border pb-2">
                    <span className="text-foreground font-medium tabular-nums shrink-0">
                      {i.quantity ?? ""} {i.unit ?? ""}
                    </span>
                    <span className="text-muted-foreground">{i.name}{i.notes ? ` · ${i.notes}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {r.allergens && r.allergens.length > 0 && (
              <div className="mt-6 text-sm">
                <p className="text-foreground font-medium mb-1">Contains</p>
                <p className="text-muted-foreground">{r.allergens.join(", ")}</p>
              </div>
            )}
          </aside>

          <section className="lg:col-span-2">
            <h2 className="font-display text-2xl font-semibold text-primary mb-4">Instructions</h2>
            {steps.length === 0 ? (
              <p className="text-muted-foreground text-sm">No instructions yet.</p>
            ) : (
              <ol className="space-y-4">
                {steps.map((step: string, idx: number) => (
                  <li key={idx} className="flex gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                      {idx + 1}
                    </span>
                    <p className="text-foreground leading-relaxed pt-1">{step}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <Link to="/recipes" className="text-primary hover:underline text-sm">← Back to all recipes</Link>
        </div>
      </article>
      <PublicFooter />
    </div>
  );
}
