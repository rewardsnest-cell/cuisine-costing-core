import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Printer, Heart, ShoppingCart, Loader2, FileDown, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// Public scaling rule for home-cook recipes: 1 through 10 servings.
// Anything beyond that funnels to /catering/quote.
const PUBLIC_MIN = 1;
const PUBLIC_MAX = 10;

type Ingredient = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  cost_per_unit?: number | null;
  inventory_cost?: number | null;
};

function fmtQty(q: number): string {
  if (!isFinite(q) || q <= 0) return "";
  const rounded = Math.round(q * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function lineCost(i: Ingredient, factor: number): number {
  const qty = (i.quantity || 0) * factor;
  const unitCost = Number(i.inventory_cost ?? i.cost_per_unit ?? 0);
  if (!qty || !unitCost) return 0;
  return qty * unitCost;
}

export function RecipeScaler({
  recipeId,
  recipeName,
  baseServings,
  ingredients,
  allergens,
  pricePerPerson,
  totalRecipeCost,
  hidePricing = false,
  publicLimit = false,
}: {
  recipeId: string;
  recipeName: string;
  baseServings: number;
  ingredients: Ingredient[];
  allergens?: string[] | null;
  pricePerPerson?: number | null;
  totalRecipeCost?: number | null;
  hidePricing?: boolean;
  /**
   * When true, restrict scaling to 1 / 5 / 10 servings only (home-cook public rule)
   * and show an educational catering CTA instead of a free-form slider.
   */
  publicLimit?: boolean;
}) {
  // Initial servings: in publicLimit mode, snap to nearest allowed value (default 5).
  const initial = publicLimit
    ? 5
    : (baseServings && baseServings > 0 ? baseServings : 4);
  const [servings, setServings] = useState<number>(initial);
  const [favLoading, setFavLoading] = useState(false);
  const [isFav, setIsFav] = useState<boolean | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) { setIsFav(false); return; }
    (supabase as any)
      .from("recipe_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("recipe_id", recipeId)
      .maybeSingle()
      .then(({ data }: any) => setIsFav(!!data));
  }, [user, recipeId]);

  // Scaling is always relative to the AUTHORED base servings, even in public
  // mode — `initial` is just the chip we start on.
  const authored = baseServings && baseServings > 0 ? baseServings : 4;
  const factor = servings / authored;

  const scaled = useMemo(
    () => ingredients.map((i) => ({
      ...i,
      scaledQty: i.quantity != null ? i.quantity * factor : null,
      scaledCost: lineCost(i, factor),
    })),
    [ingredients, factor],
  );

  const scaledTotal = useMemo(() => scaled.reduce((sum, i) => sum + (i.scaledCost || 0), 0), [scaled]);
  const hasCosts = !hidePricing && scaledTotal > 0;
  const showPricePerPerson = !hidePricing && pricePerPerson != null && pricePerPerson > 0;

  const handlePrint = () => {
    window.open(`/api/recipes/${recipeId}/printable?servings=${servings}`, "_blank", "noopener");
  };

  const downloadRecipeCard = async () => {
    setPdfLoading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const w = doc.internal.pageSize.getWidth();
      const margin = 50;
      let y = margin;

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text(recipeName, margin, y);
      y += 28;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Serves ${servings}${servings !== initial ? ` (scaled ×${factor.toFixed(2).replace(/\.?0+$/, "")})` : ""}`, margin, y);
      y += 18;

      // Pricing summary
      if (hasCosts || pricePerPerson) {
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, y, w - margin, y);
        y += 16;
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        if (hasCosts) {
          doc.setFont("helvetica", "bold");
          doc.text(`Total ingredient cost: $${scaledTotal.toFixed(2)}`, margin, y);
          y += 14;
          doc.setFont("helvetica", "normal");
          const perServing = scaledTotal / servings;
          doc.text(`Cost per serving: $${perServing.toFixed(2)}`, margin, y);
          y += 14;
        }
        if (pricePerPerson) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 130, 40);
          doc.text(`Suggested price per person: $${Number(pricePerPerson).toFixed(2)}`, margin, y);
          y += 14;
          doc.setTextColor(60, 60, 60);
          doc.setFont("helvetica", "normal");
        }
        y += 6;
      }

      // Ingredients
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, w - margin, y);
      y += 16;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(40, 40, 40);
      doc.text("Ingredients", margin, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      for (const i of scaled) {
        if (y > 720) { doc.addPage(); y = margin; }
        const qty = i.scaledQty != null ? `${fmtQty(i.scaledQty)} ${i.unit ?? ""}` : "";
        const line = `• ${qty}  ${i.name}${i.notes ? ` — ${i.notes}` : ""}`;
        const wrapped = doc.splitTextToSize(line, w - margin * 2 - 60);
        doc.text(wrapped, margin, y);
        if (i.scaledCost && i.scaledCost > 0) {
          doc.setTextColor(140, 140, 140);
          doc.text(`$${i.scaledCost.toFixed(2)}`, w - margin, y, { align: "right" });
          doc.setTextColor(40, 40, 40);
        }
        y += wrapped.length * 12 + 4;
      }

      // Footer
      if (y > 720) { doc.addPage(); y = margin; }
      y += 10;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, w - margin, y);
      y += 14;
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text("Recipe card from VPS Finest — vpsfinest.com", margin, y);

      doc.save(`${recipeName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-recipe-card.pdf`);
      toast.success("Recipe card downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const toggleFav = async () => {
    if (!user) { toast.info("Sign in to save favorites", { description: "Create a free account to save recipes." }); return; }
    setFavLoading(true);
    try {
      if (isFav) {
        await (supabase as any).from("recipe_favorites").delete().eq("user_id", user.id).eq("recipe_id", recipeId);
        setIsFav(false);
        toast.success("Removed from favorites");
      } else {
        await (supabase as any).from("recipe_favorites").insert({ user_id: user.id, recipe_id: recipeId });
        setIsFav(true);
        toast.success("Saved to favorites");
      }
    } catch (e: any) {
      toast.error("Couldn't update favorites", { description: e.message });
    } finally {
      setFavLoading(false);
    }
  };

  const addToShoppingList = async () => {
    if (scaled.length === 0) { toast.info("No ingredients to add"); return; }
    setShopLoading(true);
    try {
      if (user) {
        const rows = scaled.map((i) => ({
          user_id: user.id,
          recipe_id: recipeId,
          name: i.name,
          quantity: i.scaledQty,
          unit: i.unit,
          notes: i.notes ? `${recipeName}: ${i.notes}` : recipeName,
        }));
        const { error } = await (supabase as any).from("shopping_list_items").insert(rows);
        if (error) throw error;
        toast.success(`Added ${rows.length} items to shopping list`);
      } else {
        // Anonymous fallback: store in localStorage so the button still works
        const KEY = "shopping_list_local_v1";
        const existing = (() => {
          try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
        })();
        const additions = scaled.map((i) => ({
          id: crypto.randomUUID(),
          recipe_id: recipeId,
          recipe_name: recipeName,
          name: i.name,
          quantity: i.scaledQty,
          unit: i.unit,
          notes: i.notes || null,
          checked: false,
          created_at: new Date().toISOString(),
        }));
        localStorage.setItem(KEY, JSON.stringify([...existing, ...additions]));
        toast.success(`Added ${additions.length} items to your list`, {
          description: "Sign in to sync your shopping list across devices.",
        });
      }
    } catch (e: any) {
      toast.error("Couldn't add to list", { description: e.message });
    } finally {
      setShopLoading(false);
    }
  };

  return (
    <div>
      {/* Pricing summary */}
      {(hasCosts || showPricePerPerson) && (
        <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 mb-5">
          {showPricePerPerson && (
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Catering price per person</p>
              <p className="font-display text-3xl font-bold text-gradient-gold tabular-nums mt-1">
                ${Number(pricePerPerson).toFixed(2)}
              </p>
            </div>
          )}
          {hasCosts && (
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/50 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total cost</p>
                <p className="font-semibold tabular-nums">${scaledTotal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Per serving</p>
                <p className="font-semibold tabular-nums">${(scaledTotal / servings).toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={downloadRecipeCard} variant="default" size="sm" disabled={pdfLoading}>
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          Download recipe card
        </Button>
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="w-4 h-4" /> Printable
        </Button>
        <Button onClick={toggleFav} variant={isFav ? "default" : "outline"} size="sm" disabled={favLoading}>
          {favLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />}
          {isFav ? "Saved" : "Save"}
        </Button>
        <Button onClick={addToShoppingList} variant="outline" size="sm" disabled={shopLoading}>
          {shopLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
          Shopping list
        </Button>
      </div>

      {/* Scale servings */}
      {publicLimit ? (
        <>
          <div className="rounded-xl border border-border bg-card p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Cooking for
                </p>
                <p className="text-foreground font-medium">
                  {servings} {servings === 1 ? "person" : "people"}
                  {servings !== authored && (
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      (×{factor.toFixed(2).replace(/\.?0+$/, "")})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => setServings((s) => Math.max(PUBLIC_MIN, s - 1))} aria-label="Decrease servings">
                  <Minus className="w-3 h-3" />
                </Button>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => setServings((s) => Math.min(PUBLIC_MAX, s + 1))} aria-label="Increase servings">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <Slider
              value={[Math.min(PUBLIC_MAX, Math.max(PUBLIC_MIN, servings))]}
              min={PUBLIC_MIN}
              max={PUBLIC_MAX}
              step={1}
              onValueChange={([v]) => setServings(v)}
            />
            <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground mt-1.5">
              <span>{PUBLIC_MIN}</span>
              <span>{PUBLIC_MAX}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 mb-5">
            <p className="text-sm text-foreground font-medium mb-1">Cooking for more than 10?</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Once you go past about a dozen guests, cooking becomes its own craft — timing, holding temperatures, and equipment all change. Let our catering team plan the menu and handle the cooking for you.
            </p>
            <Link to="/catering/quote">
              <Button size="sm">Talk to a caterer — get a quote</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Scale servings</p>
                <p className="text-foreground font-medium">
                  {servings} {servings === 1 ? "serving" : "servings"}
                  {servings !== initial && (
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      (×{factor.toFixed(2).replace(/\.?0+$/, "")})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Decrease servings">
                  <Minus className="w-3 h-3" />
                </Button>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => setServings((s) => Math.min(10, s + 1))} aria-label="Increase servings">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <Slider value={[servings]} min={1} max={10} step={1} onValueChange={([v]) => setServings(v)} />
            {servings !== initial && (
              <button onClick={() => setServings(initial)} className="text-xs text-primary hover:underline mt-2">
                Reset to {initial}
              </button>
            )}
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 mb-5">
            <p className="text-sm text-foreground font-medium mb-1">Cooking for more than 10?</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Once you go past about a dozen guests, cooking becomes its own craft — timing, holding temperatures, and equipment all change. Let our catering team plan the menu and handle the cooking for you.
            </p>
            <Link to="/catering/quote">
              <Button size="sm">Talk to a caterer — get a quote</Button>
            </Link>
          </div>
        </>
      )}

      {/* Ingredients list */}
      {scaled.length === 0 ? (
        <p className="text-muted-foreground text-sm">No ingredients listed.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {scaled.map((i) => (
            <li key={i.id} className="flex gap-2 border-b border-border pb-2">
              <span className="text-foreground font-medium tabular-nums shrink-0">
                {i.scaledQty != null ? fmtQty(i.scaledQty) : ""} {i.unit ?? ""}
              </span>
              <span className="text-muted-foreground flex-1">
                {i.name}
                {i.notes ? ` · ${i.notes}` : ""}
              </span>
              {!hidePricing && i.scaledCost > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  ${i.scaledCost.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {allergens && allergens.length > 0 && (
        <div className="mt-6 text-sm">
          <p className="text-foreground font-medium mb-1">Contains</p>
          <p className="text-muted-foreground">{allergens.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
