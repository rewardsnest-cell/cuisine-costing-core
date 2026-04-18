import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChefHat, ImageOff, Sparkles, Crown, Search } from "lucide-react";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — VPS Finest Catering" },
      {
        name: "description",
        content:
          "Browse the VPS Finest catering menu — chef-crafted dishes with transparent per-person pricing. Standard and premium options available.",
      },
      { property: "og:title", content: "Menu — VPS Finest Catering" },
      {
        property: "og:description",
        content:
          "Browse the VPS Finest catering menu — chef-crafted dishes with transparent per-person pricing.",
      },
    ],
  }),
  component: PublicMenuPage,
});

type MenuRecipe = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  cost_per_serving: number | null;
  menu_price: number | null;
  is_standard: boolean;
  is_premium: boolean;
  is_vegetarian: boolean | null;
  is_vegan: boolean | null;
  is_gluten_free: boolean | null;
};

const MARKUP = 3.5;

const MEAT_TYPES = [
  { key: "beef", label: "Beef", patterns: ["beef", "steak", "brisket", "ribeye", "sirloin", "filet", "prime rib", "burger", "meatball", "short rib"] },
  { key: "chicken", label: "Chicken", patterns: ["chicken", "poultry", "wing", "drumstick", "thigh"] },
  { key: "pork", label: "Pork", patterns: ["pork", "bacon", "ham", "sausage", "prosciutto", "pancetta", "chorizo"] },
  { key: "seafood", label: "Seafood", patterns: ["fish", "salmon", "shrimp", "crab", "lobster", "tuna", "scallop", "cod", "tilapia", "mussel", "clam", "oyster", "calamari", "squid"] },
  { key: "lamb", label: "Lamb", patterns: ["lamb", "mutton"] },
  { key: "turkey", label: "Turkey", patterns: ["turkey"] },
  { key: "vegetarian", label: "Vegetarian", patterns: [] },
] as const;

type MeatKey = (typeof MEAT_TYPES)[number]["key"] | "all";

function detectMeat(r: Pick<MenuRecipe, "name" | "description" | "is_vegetarian" | "is_vegan">): MeatKey | null {
  const hay = `${r.name} ${r.description || ""}`.toLowerCase();
  for (const m of MEAT_TYPES) {
    if (m.key === "vegetarian") continue;
    if (m.patterns.some((p) => hay.includes(p))) return m.key;
  }
  if (r.is_vegetarian || r.is_vegan) return "vegetarian";
  return null;
}

function resolvedPrice(r: Pick<MenuRecipe, "menu_price" | "cost_per_serving">) {
  if (r.menu_price != null && Number(r.menu_price) > 0) return Number(r.menu_price);
  return Number(r.cost_per_serving || 0) * MARKUP;
}

function PublicMenuPage() {
  const [recipes, setRecipes] = useState<MenuRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<"all" | "standard" | "premium">("all");

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("recipes")
        .select(
          "id, name, description, category, image_url, cost_per_serving, menu_price, is_standard, is_premium, is_vegetarian, is_vegan, is_gluten_free",
        )
        .eq("active", true)
        .order("name");
      setRecipes((data || []) as MenuRecipe[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (tier === "standard") return recipes.filter((r) => r.is_standard);
    if (tier === "premium") return recipes.filter((r) => r.is_premium);
    return recipes;
  }, [recipes, tier]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuRecipe[]>();
    for (const r of filtered) {
      const key = r.category?.trim() || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground">Our Menu</h1>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            Chef-crafted dishes for weddings, corporate events, and private gatherings. Every price is per person —
            transparent and honest.
          </p>

          <div className="inline-flex mt-6 rounded-full border border-border bg-card p-1 text-sm">
            {(["all", "standard", "premium"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`px-4 py-1.5 rounded-full transition-colors capitalize ${
                  tier === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">Loading menu…</p>
        ) : filtered.length === 0 ? (
          <Card className="shadow-warm border-border/50 max-w-md mx-auto">
            <CardContent className="p-12 text-center">
              <ChefHat className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No menu items in this section yet. Check back soon.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-12">
            {grouped.map(([category, items]) => (
              <section key={category}>
                <h2 className="font-display text-2xl font-semibold mb-5 border-b border-border pb-2">{category}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {items.map((r) => {
                    const price = resolvedPrice(r);
                    return (
                      <Card key={r.id} className="shadow-warm border-border/50 overflow-hidden flex flex-col">
                        <div className="aspect-video bg-muted relative overflow-hidden">
                          {r.image_url ? (
                            <img
                              src={r.image_url}
                              alt={r.name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/50">
                              <ImageOff className="w-8 h-8 mb-1" />
                              <span className="text-xs">No photo</span>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                            {r.is_premium && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/90 text-gold-foreground text-[10px] font-semibold uppercase tracking-wide">
                                <Crown className="w-3 h-3" /> Premium
                              </span>
                            )}
                            {r.is_standard && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-semibold uppercase tracking-wide">
                                <Sparkles className="w-3 h-3" /> Standard
                              </span>
                            )}
                          </div>
                        </div>
                        <CardContent className="p-4 flex-1 flex flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-display text-lg font-semibold leading-tight">{r.name}</h3>
                            <div className="text-right shrink-0">
                              <div className="font-display text-lg font-bold text-gradient-gold">
                                ${price.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">per person</div>
                            </div>
                          </div>
                          {r.description && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{r.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {r.is_vegetarian && (
                              <span className="px-2 py-0.5 bg-success/10 text-success text-[10px] rounded-full">
                                Vegetarian
                              </span>
                            )}
                            {r.is_vegan && (
                              <span className="px-2 py-0.5 bg-success/10 text-success text-[10px] rounded-full">
                                Vegan
                              </span>
                            )}
                            {r.is_gluten_free && (
                              <span className="px-2 py-0.5 bg-gold/20 text-warm text-[10px] rounded-full">GF</span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">Ready to plan your event?</p>
          <Link to="/catering/quote">
            <Button size="lg" className="bg-gradient-warm text-primary-foreground">
              Get a Custom Quote
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
