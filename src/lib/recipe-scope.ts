/**
 * Core architecture: recipe scope separation.
 *
 * Every recipe has a permanent `scope` that determines where it may appear.
 * This is enforced at the DATABASE LAYER (see migration: triggers on
 * recipes.scope and quote_items.recipe_id). This module is the single
 * source of truth for app-layer code that filters or assigns scope.
 *
 * RULES (enforced in DB; mirror them in app code):
 *   1. Catering menus, quotes, and pricing logic may ONLY consume
 *      `catering_internal` or `shared_controlled` recipes.
 *   2. Public home recipe surfaces may ONLY show
 *      `home_public` or `shared_controlled` recipes.
 *   3. `shared_controlled` is rare and explicit — it requires a deliberate
 *      curator decision, not a default.
 *
 * Menus are CURATED VIEWS over recipes, not separate food objects. Do not
 * introduce a parallel "menu_items" food table.
 */

export type RecipeScope = "home_public" | "catering_internal" | "shared_controlled";

export const RECIPE_SCOPE = {
  HOME_PUBLIC: "home_public",
  CATERING_INTERNAL: "catering_internal",
  SHARED_CONTROLLED: "shared_controlled",
} as const satisfies Record<string, RecipeScope>;

/** Scopes that may be displayed on public (home cooking) surfaces. */
export const PUBLIC_VISIBLE_SCOPES: readonly RecipeScope[] = [
  RECIPE_SCOPE.HOME_PUBLIC,
  RECIPE_SCOPE.SHARED_CONTROLLED,
];

/** Scopes that may be used in catering menus, quotes, and pricing. */
export const CATERING_USABLE_SCOPES: readonly RecipeScope[] = [
  RECIPE_SCOPE.CATERING_INTERNAL,
  RECIPE_SCOPE.SHARED_CONTROLLED,
];

export function isPublicVisible(scope: RecipeScope | null | undefined): boolean {
  return scope != null && (PUBLIC_VISIBLE_SCOPES as readonly string[]).includes(scope);
}

export function isCateringUsable(scope: RecipeScope | null | undefined): boolean {
  return scope != null && (CATERING_USABLE_SCOPES as readonly string[]).includes(scope);
}
