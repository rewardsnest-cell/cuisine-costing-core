import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Printer, Heart, ShoppingCart, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type Ingredient = { id: string; name: string; quantity: number | null; unit: string | null; notes: string | null };

function fmtQty(q: number): string {
  if (!isFinite(q) || q <= 0) return "";
  // Show fractions for common values
  const rounded = Math.round(q * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function RecipeScaler({
  recipeId,
  recipeName,
  baseServings,
  ingredients,
  allergens,
}: {
  recipeId: string;
  recipeName: string;
  baseServings: number;
  ingredients: Ingredient[];
  allergens?: string[] | null;
}) {
  const initial = baseServings && baseServings > 0 ? baseServings : 4;
  const [servings, setServings] = useState<number>(initial);
  const [favLoading, setFavLoading] = useState(false);
  const [isFav, setIsFav] = useState<boolean | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const { user } = useAuth();

  // Load fav state once on mount when user is known
  useMemo(() => {
    if (!user) { setIsFav(false); return; }
    (supabase as any)
      .from("recipe_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("recipe_id", recipeId)
      .maybeSingle()
      .then(({ data }: any) => setIsFav(!!data));
  }, [user, recipeId]);

  const factor = servings / initial;

  const scaled = ingredients.map((i) => ({
    ...i,
    scaledQty: i.quantity != null ? i.quantity * factor : null,
  }));

  const handlePrint = () => {
    window.open(`/api/recipes/${recipeId}/printable?servings=${servings}`, "_blank", "noopener");
  };

  const toggleFav = async () => {
    if (!user) {
      toast.info("Sign in to save favorites", { description: "Create a free account to save recipes." });
      return;
    }
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
    if (!user) {
      toast.info("Sign in to use your shopping list");
      return;
    }
    if (scaled.length === 0) {
      toast.info("No ingredients to add");
      return;
    }
    setShopLoading(true);
    try {
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
    } catch (e: any) {
      toast.error("Couldn't add to list", { description: e.message });
    } finally {
      setShopLoading(false);
    }
  };

  return (
    <div>
      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="w-4 h-4" /> Printable version
        </Button>
        <Button onClick={toggleFav} variant={isFav ? "default" : "outline"} size="sm" disabled={favLoading}>
          {favLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />}
          {isFav ? "Saved" : "Save to favorites"}
        </Button>
        <Button onClick={addToShoppingList} variant="outline" size="sm" disabled={shopLoading}>
          {shopLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
          Add to shopping list
        </Button>
      </div>

      {/* Scale servings */}
      <div className="rounded-xl border border-border bg-card p-4 mb-5">
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
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="Decrease servings"
            >
              <Minus className="w-3 h-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setServings((s) => Math.min(100, s + 1))}
              aria-label="Increase servings"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <Slider
          value={[servings]}
          min={1}
          max={Math.max(24, initial * 4)}
          step={1}
          onValueChange={([v]) => setServings(v)}
        />
        {servings !== initial && (
          <button
            onClick={() => setServings(initial)}
            className="text-xs text-primary hover:underline mt-2"
          >
            Reset to {initial}
          </button>
        )}
      </div>

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
              <span className="text-muted-foreground">
                {i.name}
                {i.notes ? ` · ${i.notes}` : ""}
              </span>
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
