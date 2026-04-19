/**
 * Single source of truth for splitting recipes/menu into Food vs Cocktails.
 * A recipe is a "cocktail" when its `category` equals "Cocktail" (case-insensitive).
 * Anything else (including null/empty category) is treated as "food".
 */
export type RecipeKind = "food" | "cocktail";

export function recipeKind(category: string | null | undefined): RecipeKind {
  return (category || "").trim().toLowerCase() === "cocktail" ? "cocktail" : "food";
}

export function isCocktail(category: string | null | undefined): boolean {
  return recipeKind(category) === "cocktail";
}
