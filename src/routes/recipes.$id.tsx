import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { youtubeEmbedUrl } from "@/lib/recipe-video";
import { RecipeEmailCTA } from "@/components/recipes/RecipeEmailCTA";
import { RecipeScaler } from "@/components/recipes/RecipeScaler";
import { usePricingVisibility } from "@/lib/use-pricing-visibility";

const SITE = "https://www.vpsfinest.com";

export const Route = createFileRoute("/recipes/$id")({
  loader: async ({ params }) => {
    const { data: recipe, error } = await (supabase as any)
      .from("recipes")
      .select(
        "id, name, description, hook, image_url, coupon_image_url, coupon_text, coupon_valid_until, category, cuisine, servings, serving_size, prep_time, cook_time, instructions, allergens, is_vegetarian, is_vegan, is_gluten_free, active, video_url, video_embed_html, skill_level, use_case, pro_tips, serving_suggestions, storage_instructions, reheating_instructions, cta_type, total_cost, cost_per_serving, selling_price_per_person, menu_price, is_copycat, copycat_source",
      )
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!recipe || recipe.active === false) throw notFound();

    const [{ data: ingredients }, { data: shopItems }] = await Promise.all([
      (supabase as any)
        .from("recipe_ingredients")
        .select("id, name, quantity, unit, notes, cost_per_unit, inventory_items(average_cost_per_unit)")
        .eq("recipe_id", params.id)
        .order("name"),
      (supabase as any)
        .from("recipe_shop_items")
        .select("id, name, benefit, url, image_url, is_affiliate, position")
        .eq("recipe_id", params.id)
        .order("position"),
    ]);

    const enrichedIngredients = (ingredients || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      notes: row.notes,
      cost_per_unit: row.cost_per_unit,
      inventory_cost: row.inventory_items?.average_cost_per_unit ?? null,
    }));

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

    return { recipe, ingredients: enrichedIngredients, shopItems: shopItems || [], related };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.recipe) return { meta: [{ title: "Recipe — VPS Finest" }] };
    const r = loaderData.recipe;
    const title = `${r.name} — VPS Finest`;
    const description =
      r.hook || r.description ||
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
            video: r.video_url ? { "@type": "VideoObject", name: r.name, contentUrl: r.video_url } : undefined,
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
        <div className="max-w-3xl mx-auto px-4 py-24 space-y-4">
          <h1 className="font-display text-3xl text-primary">Something went wrong</h1>
          <p className="text-muted-foreground">{error.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => router.invalidate()} variant="outline">Retry</Button>
            <Link to="/recipes"><Button>Back to recipes</Button></Link>
          </div>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-24 space-y-4">
        <h1 className="font-display text-3xl text-primary">Recipe not found</h1>
        <p className="text-muted-foreground">It may have been removed or unpublished.</p>
        <Link to="/recipes"><Button>Back to recipes</Button></Link>
      </div>
    </div>
  ),
});

function totalMinutes(prep?: number | null, cook?: number | null) {
  const t = (prep || 0) + (cook || 0);
  return t > 0 ? t : null;
}

function RecipeDetailPage() {
  const { recipe, ingredients, shopItems, related } = Route.useLoaderData();
  const { showPricing } = usePricingVisibility();
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

  const proTips: string[] = Array.isArray(r.pro_tips) ? r.pro_tips.filter((t: any) => typeof t === "string" && t.trim()) : [];
  const total = totalMinutes(r.prep_time, r.cook_time);
  const embed = youtubeEmbedUrl(r.video_url);
  const hasVideo = !!(embed || r.video_embed_html);

  return (
    <div className="min-h-screen bg-background">
      <article className="pt-24 pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="text-sm text-muted-foreground mb-6">
          <Link to="/recipes" className="hover:text-primary">Recipes</Link>
          <span className="mx-2">/</span>
          <span>{r.name}</span>
        </nav>

        {/* 1. HERO */}
        <header className="mb-10">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
            {r.category && <span className="uppercase tracking-widest text-primary">{r.category}</span>}
            {r.cuisine && <span>· {r.cuisine}</span>}
            {r.use_case && <span>· {r.use_case}</span>}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-4">{r.name}</h1>
          {r.hook && (
            <p className="text-lg text-muted-foreground max-w-2xl">{r.hook}</p>
          )}
          {!r.hook && r.description && (
            <p className="text-lg text-muted-foreground max-w-2xl">{r.description}</p>
          )}

          {r.image_url && (
            <div className="aspect-[16/9] bg-secondary rounded-2xl overflow-hidden mt-6">
              <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
            </div>
          )}

          {/* Quick facts */}
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 text-sm">
            <Fact label="Prep" value={r.prep_time != null ? `${r.prep_time}m` : "—"} />
            <Fact label="Cook" value={r.cook_time != null ? `${r.cook_time}m` : "—"} />
            <Fact label="Total" value={total ? `${total}m` : "—"} />
            <Fact label="Servings" value={r.servings != null ? String(r.servings) : "—"} />
            <Fact label="Skill" value={r.skill_level || "—"} />
          </dl>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {tags.map((t) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">{t}</span>
              ))}
            </div>
          )}

          {/* Jump links */}
          <div className="flex flex-wrap gap-2 mt-6 text-sm">
            {hasVideo && <a href="#video" className="px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition">Watch video</a>}
            {shopItems.length > 0 && <a href="#shop" className="px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition">Shop this recipe</a>}
            <button
              type="button"
              onClick={() => typeof window !== "undefined" && window.print()}
              className="px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition"
            >
              Print recipe
            </button>
            <a
              href={`/api/recipes/${r.id}/printable`}
              target="_blank"
              rel="noopener"
              className="px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition"
            >
              Download PDF
            </a>
          </div>
        </header>

        {/* 2. VIDEO */}
        {hasVideo && (
          <section id="video" className="mb-12">
            <h2 className="font-display text-2xl font-semibold text-primary mb-4">Watch how to make this recipe</h2>
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
              {embed ? (
                <iframe
                  src={embed}
                  title={`${r.name} video`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: r.video_embed_html }} className="w-full h-full" />
              )}
            </div>
          </section>
        )}

        {/* 3. INTRODUCTION */}
        {r.description && (
          <section className="mb-12 prose prose-neutral max-w-none">
            <h2 className="font-display text-2xl font-semibold text-primary mb-3">About this recipe</h2>
            {r.description.split(/\n\n+/).map((p: string, i: number) => (
              <p key={i} className="text-foreground leading-relaxed">{p}</p>
            ))}
          </section>
        )}

        {/* 4 + 5. INGREDIENTS + INSTRUCTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-12">
          <aside className="lg:col-span-1">
            <h2 className="font-display text-2xl font-semibold text-primary mb-4">Ingredients</h2>
            <RecipeScaler
              recipeId={r.id}
              recipeName={r.name}
              baseServings={r.servings ?? 4}
              ingredients={ingredients as any}
              allergens={r.allergens}
              pricePerPerson={showPricing ? (r.menu_price ?? r.selling_price_per_person ?? null) : null}
              totalRecipeCost={showPricing ? (r.total_cost ?? null) : null}
              hidePricing={!showPricing}
            />
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

        {/* 6. PRO TIPS */}
        {proTips.length > 0 && (
          <section className="mb-12 rounded-2xl border border-border bg-secondary/30 p-6">
            <h2 className="font-display text-2xl font-semibold text-primary mb-4">Pro tips & variations</h2>
            <ul className="space-y-3">
              {proTips.map((tip, i) => (
                <li key={i} className="flex gap-3 text-foreground">
                  <span className="text-primary font-semibold tabular-nums">{i + 1}.</span>
                  <span className="leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 7. SHOP THIS RECIPE */}
        {shopItems.length > 0 && (
          <section id="shop" className="mb-12">
            <h2 className="font-display text-2xl font-semibold text-primary mb-2">Shop this recipe</h2>
            <p className="text-sm text-muted-foreground mb-5">Tools, appliances, and specialty ingredients we use for this recipe.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shopItems.map((it: any) => (
                <a
                  key={it.id}
                  href={it.url || "#"}
                  target="_blank"
                  rel={it.is_affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                  className="group block border border-border rounded-xl overflow-hidden hover:border-primary transition bg-card"
                >
                  {it.image_url && (
                    <div className="aspect-square bg-secondary overflow-hidden">
                      <img src={it.image_url} alt={it.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors">{it.name}</p>
                    {it.benefit && <p className="text-sm text-muted-foreground mt-1">{it.benefit}</p>}
                    {it.is_affiliate && <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">Affiliate link</p>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 8. SERVING & STORAGE */}
        {(r.serving_suggestions || r.storage_instructions || r.reheating_instructions) && (
          <section className="mb-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {r.serving_suggestions && (
              <div>
                <h3 className="font-display text-lg text-primary mb-2">Serving</h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{r.serving_suggestions}</p>
              </div>
            )}
            {r.storage_instructions && (
              <div>
                <h3 className="font-display text-lg text-primary mb-2">Storage</h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{r.storage_instructions}</p>
              </div>
            )}
            {r.reheating_instructions && (
              <div>
                <h3 className="font-display text-lg text-primary mb-2">Reheating</h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{r.reheating_instructions}</p>
              </div>
            )}
          </section>
        )}

        {/* 9. EMAIL CAPTURE CTA */}
        <section className="mb-8">
          <RecipeEmailCTA recipeId={r.id} recipeName={r.name} />
        </section>

        {/* Secondary contextual CTA */}
        <section className="mb-12 rounded-2xl bg-secondary/40 border border-border p-6 text-center">
          {r.cta_type === "menu" ? (
            <>
              <h3 className="font-display text-2xl text-primary mb-2">Hosting an event?</h3>
              <p className="text-muted-foreground mb-4">See our full catering menu and tasting options.</p>
              <Link to="/menu"><Button>View catering menu</Button></Link>
            </>
          ) : r.cta_type === "quote" ? (
            <>
              <h3 className="font-display text-2xl text-primary mb-2">Catering this for a crowd?</h3>
              <p className="text-muted-foreground mb-4">Get a same-day quote tailored to your guest count.</p>
              <Link to="/catering/quote"><Button>Request a quote</Button></Link>
            </>
          ) : (
            <>
              <h3 className="font-display text-2xl text-primary mb-2">Get more recipes like this</h3>
              <p className="text-muted-foreground mb-4">New recipes, seasonal menus, and event ideas — sent occasionally.</p>
              <Link to="/follow"><Button>Subscribe</Button></Link>
            </>
          )}
        </section>

        {/* Coupon, if present */}
        {r.coupon_image_url && (
          <figure className="mb-12">
            <div className="aspect-[16/9] bg-secondary rounded-2xl overflow-hidden ring-1 ring-primary/20 shadow-lg">
              <img src={r.coupon_image_url} alt={`${r.name} — special offer`} className="w-full h-full object-cover" />
            </div>
            <figcaption className="text-xs text-muted-foreground mt-2 text-center">
              {r.coupon_text || "Special offer"}
              {r.coupon_valid_until ? ` · valid until ${r.coupon_valid_until}` : ""}
            </figcaption>
          </figure>
        )}

        {/* Related */}
        {related && related.length > 0 && (
          <section className="mt-16 pt-10 border-t border-border">
            <h2 className="font-display text-2xl font-semibold text-primary mb-6">Related recipes</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {related.map((rr: any) => (
                <Link key={rr.id} to="/recipes/$id" params={{ id: rr.id }} className="group block">
                  <div className="aspect-[4/3] bg-secondary rounded-xl overflow-hidden mb-3">
                    {rr.image_url ? (
                      <img src={rr.image_url} alt={rr.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : null}
                  </div>
                  <p className="text-xs uppercase tracking-widest text-primary mb-1">{rr.category || rr.cuisine || "Recipe"}</p>
                  <h3 className="font-display text-lg text-foreground group-hover:text-primary transition-colors">{rr.name}</h3>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 10. LEGAL */}
        <p className="mt-16 pt-8 border-t border-border text-xs text-muted-foreground text-center">
          This page may contain affiliate links. We may earn a commission if you make a purchase, at no extra cost to you.
        </p>

        <div className="mt-6">
          <Link to="/recipes" className="text-primary hover:underline text-sm">← Back to all recipes</Link>
        </div>
      </article>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-border pl-3">
      <dt className="text-[10px] tracking-widest uppercase text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-medium mt-0.5">{value}</dd>
    </div>
  );
}
