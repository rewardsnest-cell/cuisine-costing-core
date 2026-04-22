/**
 * Phase 3: Recipe Pricing Health derivation (client-side helpers).
 *
 * Health is derived — never manually editable. The SQL functions
 * `recipe_pricing_health(recipe_id)` and `recipe_pricing_health_summary()`
 * are the source of truth. These helpers normalize their JSON shape and
 * provide labels/colors for UI rendering.
 */

export type HealthStatus = "healthy" | "warning" | "blocked";

export type HealthCheckKey =
  | "resolution"
  | "units"
  | "density"
  | "waste"
  | "price"
  | "freshness";

export type HealthCheckSeverity = "block" | "warn";

export type HealthCheckError = { ingredient?: string; message?: string };

export type HealthCheck = {
  key: HealthCheckKey;
  label: string;
  severity: HealthCheckSeverity;
  passed: boolean;
  count_ok: number;
  count_total: number;
  errors: HealthCheckError[];
  threshold_days?: number;
};

export type RecipePricingHealth = {
  health_status: HealthStatus;
  pricing_status: string;
  pricing_errors?: Array<{ ingredient?: string; issue?: string; message?: string }>;
  freshness_days: number;
  ingredient_count: number;
  checks: HealthCheck[];
};

export type RecipeHealthSummaryRow = {
  recipe_id: string;
  health_status: HealthStatus;
  stale_ingredient_count: number;
};

export const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  blocked: "Blocked",
};

/** Tailwind-compatible classes for status badges (uses semantic tokens). */
export const HEALTH_BADGE_CLASS: Record<HealthStatus, string> = {
  healthy: "bg-success/15 text-success border border-success/30",
  warning: "bg-warning/15 text-warning border border-warning/30",
  blocked: "bg-destructive/15 text-destructive border border-destructive/30",
};

export const HEALTH_SORT_RANK: Record<HealthStatus, number> = {
  blocked: 0,
  warning: 1,
  healthy: 2,
};

const CHECK_FIX_HINTS: Record<HealthCheckKey, string> = {
  resolution: "Open the recipe and link the ingredient to an inventory item, or add a matching entry in Ingredient Reference.",
  units: "Adjust the recipe ingredient unit so it can convert to the inventory unit, or add density on the ingredient reference.",
  density: "Set density_g_per_ml on the ingredient reference (Admin → Ingredient Reference).",
  waste: "Set waste_factor (0–1] on the ingredient reference (Admin → Ingredient Reference).",
  price: "Link the ingredient reference to an inventory item with a positive average cost.",
  freshness: "Recompute inventory cost from a recent receipt or purchase order.",
};

export function fixHintForCheck(key: HealthCheckKey): string {
  return CHECK_FIX_HINTS[key];
}

export function isHealth(value: unknown): value is RecipePricingHealth {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.health_status === "string" && Array.isArray(v.checks);
}
