import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChefHat, ImageOff, Sparkles, Crown, Search, RotateCcw, Plus, Minus, Check } from "lucide-react";
import { SelectionTray, useMenuSelections } from "@/components/menu/SelectionTray";
import { isCocktail, type RecipeKind } from "@/lib/recipe-kind";
import { RecipePlaceholder } from "@/components/RecipePlaceholder";

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
  selling_price_per_person: number | null;
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

function resolvedPrice(r: Pick<MenuRecipe, "menu_price" | "cost_per_serving" | "selling_price_per_person">) {
  if (r.menu_price != null && Number(r.menu_price) > 0) return Number(r.menu_price);
  if (r.selling_price_per_person != null && Number(r.selling_price_per_person) > 0) return Number(r.selling_price_per_person);
  return Number(r.cost_per_serving || 0) * MARKUP;
}

function PublicMenuPage() {
  const { add, setQty, qtyOf, has } = useMenuSelections();
  const [recipes, setRecipes] = useState<MenuRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<"all" | "standard" | "premium">("all");
  const [kind, setKind] = useState<RecipeKind>("food");
  const [meat, setMeat] = useState<MeatKey>("all");
  const [category, setCategory] = useState<string>("all");
  const [dietary, setDietary] = useState<"all" | "vegetarian" | "vegan" | "gluten-free">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"price-asc" | "price-desc" | "name-asc">("name-asc");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  const [priceMax, setPriceMax] = useState(100);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("recipes")
        .select(
          "id, name, description, category, image_url, cost_per_serving, menu_price, selling_price_per_person, is_standard, is_premium, is_vegetarian, is_vegan, is_gluten_free",
        )
        .eq("active", true)
        .order("name");
      const list = (data || []) as MenuRecipe[];
      setRecipes(list);
      const maxP = Math.max(10, Math.ceil(list.reduce((m, r) => Math.max(m, resolvedPrice(r)), 0)));
      setPriceMax(maxP);
      setPriceRange([0, maxP]);
      setLoading(false);
    })();
  }, []);

  // Highlight a recipe card briefly when arriving via #recipe-<id> anchor
  useEffect(() => {
    if (loading || recipes.length === 0) return;
    if (typeof window === "undefined") return;
    const triggerFromHash = () => {
      const hash = window.location.hash;
      const m = hash.match(/^#recipe-(.+)$/);
      if (!m) return;
      const id = m[1];
      // Wait a tick so the card is rendered + scroll-mt offset applied
      setTimeout(() => {
        setHighlightId(id);
        const el = document.getElementById(`recipe-${id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightId(null), 1600);
      }, 100);
    };
    triggerFromHash();
    window.addEventListener("hashchange", triggerFromHash);
    return () => window.removeEventListener("hashchange", triggerFromHash);
  }, [loading, recipes.length]);

  const meatCounts = useMemo(() => {
    const counts: Record<string, number> = { all: recipes.length };
    for (const m of MEAT_TYPES) counts[m.key] = 0;
    for (const r of recipes) {
      const k = detectMeat(r);
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [recipes]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: recipes.length };
    for (const r of recipes) {
      const cat = r.category?.trim() || "Other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [recipes]);

  const dietaryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: recipes.length, vegetarian: 0, vegan: 0, "gluten-free": 0 };
    for (const r of recipes) {
      if (r.is_vegetarian) counts["vegetarian"]++;
      if (r.is_vegan) counts["vegan"]++;
      if (r.is_gluten_free) counts["gluten-free"]++;
    }
    return counts;
  }, [recipes]);

  const kindCounts = useMemo(() => {
    let food = 0;
    let cocktail = 0;
    for (const r of recipes) (isCocktail(r.category) ? cocktail++ : food++);
    return { food, cocktail };
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = recipes.filter((r) => {
      // Food vs Cocktails split (always applied)
      if (kind === "cocktail" && !isCocktail(r.category)) return false;
      if (kind === "food" && isCocktail(r.category)) return false;
      if (tier === "standard" && !r.is_standard) return false;
      if (tier === "premium" && !r.is_premium) return false;
      if (meat !== "all") {
        const k = detectMeat(r);
        if (k !== meat) return false;
      }
      if (category !== "all") {
        const cat = r.category?.trim() || "Other";
        if (cat !== category) return false;
      }
      if (dietary !== "all") {
        if (dietary === "vegetarian" && !r.is_vegetarian) return false;
        if (dietary === "vegan" && !r.is_vegan) return false;
        if (dietary === "gluten-free" && !r.is_gluten_free) return false;
      }
      const p = resolvedPrice(r);
      if (p < priceRange[0] || p > priceRange[1]) return false;
      if (q) {
        const hay = `${r.name} ${r.description || ""} ${r.category || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => resolvedPrice(a) - resolvedPrice(b));
    else if (sort === "price-desc") sorted.sort((a, b) => resolvedPrice(b) - resolvedPrice(a));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [recipes, kind, tier, meat, category, dietary, search, priceRange, sort]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuRecipe[]>();
    for (const r of filtered) {
      const key = r.category?.trim() || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (tier !== "all") count++;
    if (meat !== "all") count++;
    if (category !== "all") count++;
    if (dietary !== "all") count++;
    if (search.trim()) count++;
    if (sort !== "name-asc") count++;
    if (priceRange[0] > 0 || priceRange[1] < priceMax) count++;
    return count;
  }, [tier, meat, category, dietary, search, sort, priceRange, priceMax]);

  function resetFilters() {
    setTier("all");
    setMeat("all");
    setCategory("all");
    setDietary("all");
    setSearch("");
    setSort("name-asc");
    setPriceRange([0, priceMax]);
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground">Our Menu</h1>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            Chef-crafted dishes for weddings, corporate events, and private gatherings. Every price is per person —
            transparent and honest.
          </p>

          {/* Food vs Cocktails */}
          <div className="inline-flex mt-6 rounded-full border border-border bg-card p-1 text-sm">
            {(["food", "cocktail"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-5 py-1.5 rounded-full transition-colors ${
                  kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "food" ? "Food" : "Cocktails"}
                <span className="opacity-70 ml-1">
                  ({k === "food" ? kindCounts.food : kindCounts.cocktail})
                </span>
              </button>
            ))}
          </div>

          <div className="inline-flex mt-3 ml-0 sm:ml-3 rounded-full border border-border bg-card p-1 text-sm">
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

        <div className="max-w-xl mx-auto mb-5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search dishes, ingredients, descriptions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>
          <button
            onClick={resetFilters}
            className={`text-sm whitespace-nowrap transition-colors ${
              activeFiltersCount > 0 ? "text-destructive hover:text-destructive/80" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Clear all
          </button>
        </div>

        <div className="max-w-xl mx-auto mb-5 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Price range</span>
              <span className="font-medium text-foreground">
                ${priceRange[0].toFixed(0)} – ${priceRange[1].toFixed(0)}
              </span>
            </div>
            <Slider
              min={0}
              max={priceMax}
              step={1}
              value={priceRange}
              onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full sm:w-44 bg-card">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name (A → Z)</SelectItem>
              <SelectItem value="price-asc">Price (low → high)</SelectItem>
              <SelectItem value="price-desc">Price (high → low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground self-center mr-1">Category:</span>
          <button
            onClick={() => setCategory("all")}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
              category === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            All ({categoryCounts.all || 0})
          </button>
          {Object.entries(categoryCounts)
            .filter(([key]) => key !== "all")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, count]) => {
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
        </div>

        {/* Dietary filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground self-center mr-1">Dietary:</span>
          <button
            onClick={() => setDietary("all")}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
              dietary === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            All ({dietaryCounts.all || 0})
          </button>
          {dietaryCounts["vegetarian"] > 0 && (
            <button
              onClick={() => setDietary("vegetarian")}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                dietary === "vegetarian"
                  ? "bg-success text-success-foreground border-success"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Vegetarian ({dietaryCounts["vegetarian"]})
            </button>
          )}
          {dietaryCounts["vegan"] > 0 && (
            <button
              onClick={() => setDietary("vegan")}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                dietary === "vegan"
                  ? "bg-success text-success-foreground border-success"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Vegan ({dietaryCounts["vegan"]})
            </button>
          )}
          {dietaryCounts["gluten-free"] > 0 && (
            <button
              onClick={() => setDietary("gluten-free")}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                dietary === "gluten-free"
                  ? "bg-warning text-warning-foreground border-warning"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Gluten-Free ({dietaryCounts["gluten-free"]})
            </button>
          )}
        </div>

        {/* Meat type filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          <span className="text-xs text-muted-foreground self-center mr-1">Protein:</span>
          <button
            onClick={() => setMeat("all")}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
              meat === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            All ({meatCounts.all || 0})
          </button>
          {MEAT_TYPES.map((m) => {
            const c = meatCounts[m.key] || 0;
            if (c === 0) return null;
            return (
              <button
                key={m.key}
                onClick={() => setMeat(m.key)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  meat === m.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {m.label} ({c})
              </button>
            );
          })}
          <button
            onClick={resetFilters}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
              activeFiltersCount > 0
                ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Reset all filters"
          >
            <RotateCcw className="w-3 h-3" />
            Reset{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
          </button>
        </div>
        {loading ? (
          <p className="text-center text-muted-foreground">Loading menu…</p>
        ) : filtered.length === 0 ? (
          <Card className="shadow-warm border-border/50 max-w-md mx-auto">
            <CardContent className="p-12 text-center">
              <ChefHat className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                No menu items match your filters yet — try broadening them!
              </p>
              {activeFiltersCount > 0 && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Clear all filters
                </Button>
              )}
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
                    const inTray = has(r.id);
                    const qty = qtyOf(r.id);
                    return (
                      <Card
                        key={r.id}
                        id={`recipe-${r.id}`}
                        className={`shadow-warm border-border/50 overflow-hidden flex flex-col transition-all scroll-mt-28 rounded-xl ${
                          inTray ? "ring-2 ring-primary/40 border-primary/30" : ""
                        } ${highlightId === r.id ? "animate-anchor-pulse" : ""}`}
                      >
                        <Link
                          to="/recipes/$id"
                          params={{ id: r.id }}
                          className="block aspect-video bg-muted relative overflow-hidden group"
                          aria-label={`View ${r.name}`}
                        >
                          {r.image_url ? (
                            <img
                              src={r.image_url}
                              alt={r.name}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <RecipePlaceholder />
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
                          {inTray && (
                            <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shadow-md">
                              <Check className="w-3 h-3" /> Added
                            </div>
                          )}
                        </Link>
                        <CardContent className="p-4 flex-1 flex flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <Link to="/recipes/$id" params={{ id: r.id }} className="font-display text-lg font-semibold leading-tight hover:text-primary transition-colors">{r.name}</Link>
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
                          <div className="mt-4 pt-3 border-t border-border/50">
                            {!inTray ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  add({
                                    id: r.id,
                                    name: r.name,
                                    category: r.category,
                                    cost_per_serving: Number(r.cost_per_serving || 0),
                                  })
                                }
                                className="w-full gap-2 bg-gradient-warm text-primary-foreground"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add to Selections
                              </Button>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">Quantity per guest</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => setQty(r.id, qty - 1)}
                                    aria-label="Decrease"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <span className="min-w-7 text-center text-sm font-bold">{qty}</span>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => setQty(r.id, qty + 1)}
                                    aria-label="Increase"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
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

      <SelectionTray markup={MARKUP} />
    </div>
  );
}

