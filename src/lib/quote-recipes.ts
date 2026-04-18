import { TIERS, type SelectedRecipe } from "@/components/quote/types";

export type RecipeRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  cost_per_serving: number | null;
  is_vegetarian: boolean | null;
  is_vegan: boolean | null;
  is_gluten_free: boolean | null;
  allergens: string[] | null;
  active: boolean;
};

/**
 * Filter recipes that match ALL of the user's quote criteria:
 * - Style (meat/seafood/vegetarian/mixed) matched against name/description/cuisine + dietary flags
 * - Selected proteins must appear in name/description (mixed = no protein constraint)
 * - Allergens: drop recipes containing any of the selected allergies
 */
export function filterRecipesForSelections(
  recipes: RecipeRow[],
  opts: { style: string; proteins: string[]; allergies: string[] },
): RecipeRow[] {
  const { style, proteins, allergies } = opts;
  const allergiesLower = allergies.map((a) => a.toLowerCase());

  return recipes.filter((r) => {
    if (!r.active) return false;

    // Allergen filter
    if (allergiesLower.length && r.allergens?.length) {
      const recipeAllergens = r.allergens.map((a) => a.toLowerCase());
      if (recipeAllergens.some((a) => allergiesLower.includes(a))) return false;
    }

    const haystack = `${r.name} ${r.description ?? ""} ${r.cuisine ?? ""}`.toLowerCase();

    // Style filter
    if (style === "vegetarian") {
      if (!(r.is_vegetarian || r.is_vegan)) return false;
    } else if (style === "seafood") {
      const seafoodWords = ["fish", "salmon", "tuna", "shrimp", "crab", "lobster", "scallop", "oyster", "seafood", "calamari", "prawn"];
      if (!seafoodWords.some((w) => haystack.includes(w))) return false;
    } else if (style === "meat") {
      const meatWords = ["chicken", "beef", "pork", "lamb", "steak", "bacon", "sausage", "turkey", "duck", "brisket"];
      if (!meatWords.some((w) => haystack.includes(w))) return false;
    }
    // mixed → no style restriction

    // Protein filter — at least one selected protein must be referenced
    if (style !== "vegetarian" && proteins.length > 0) {
      const proteinHit = proteins.some((p) => haystack.includes(p.toLowerCase()));
      if (!proteinHit) return false;
    }

    return true;
  });
}

/**
 * Compute the per-guest price for a chosen recipe:
 *   cost_per_serving × markup × tier multiplier
 */
export function pricePerGuestForRecipe(
  recipe: { cost_per_serving: number | null },
  markup: number,
  tierId: string,
  servingsPerGuest = 1,
): number {
  const tier = TIERS.find((t) => t.id === tierId) ?? TIERS[0];
  const base = (Number(recipe.cost_per_serving) || 0) * markup * tier.multiplier;
  return base * servingsPerGuest;
}

export function totalForRecipes(
  recipes: SelectedRecipe[],
  guests: number,
  markup: number,
  tierId: string,
): number {
  return recipes.reduce(
    (sum, r) =>
      sum +
      pricePerGuestForRecipe(
        { cost_per_serving: r.cost_per_serving },
        markup,
        tierId,
        r.servings_per_guest,
      ) *
        Math.max(guests, 1),
    0,
  );
}
