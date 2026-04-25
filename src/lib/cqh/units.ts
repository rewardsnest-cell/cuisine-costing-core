// Client-side unit conversion mirror for the shopping-list aggregator.
// Keep in sync with src/lib/server-fns/cqh.functions.ts (UNIT_CONVERSIONS).
//
// Canonicals:
//   weight → "oz"
//   volume → "tbsp"
//   count  → "ea"
// Anything not in this table is its own dimension (bunch, can, jar, pkg, …).

export type Dimension = "weight" | "volume" | "count" | "other";

export const UNIT_CONVERSIONS: Record<string, { canonical: string; factor: number; dimension: Dimension }> = {
  // weight → oz
  oz: { canonical: "oz", factor: 1, dimension: "weight" },
  ozs: { canonical: "oz", factor: 1, dimension: "weight" },
  ounce: { canonical: "oz", factor: 1, dimension: "weight" },
  ounces: { canonical: "oz", factor: 1, dimension: "weight" },
  lb: { canonical: "oz", factor: 16, dimension: "weight" },
  lbs: { canonical: "oz", factor: 16, dimension: "weight" },
  pound: { canonical: "oz", factor: 16, dimension: "weight" },
  pounds: { canonical: "oz", factor: 16, dimension: "weight" },
  g: { canonical: "oz", factor: 0.035274, dimension: "weight" },
  gram: { canonical: "oz", factor: 0.035274, dimension: "weight" },
  grams: { canonical: "oz", factor: 0.035274, dimension: "weight" },
  kg: { canonical: "oz", factor: 35.274, dimension: "weight" },
  kilogram: { canonical: "oz", factor: 35.274, dimension: "weight" },
  kilograms: { canonical: "oz", factor: 35.274, dimension: "weight" },
  // volume → tbsp
  tbsp: { canonical: "tbsp", factor: 1, dimension: "volume" },
  tablespoon: { canonical: "tbsp", factor: 1, dimension: "volume" },
  tablespoons: { canonical: "tbsp", factor: 1, dimension: "volume" },
  tsp: { canonical: "tbsp", factor: 1 / 3, dimension: "volume" },
  teaspoon: { canonical: "tbsp", factor: 1 / 3, dimension: "volume" },
  teaspoons: { canonical: "tbsp", factor: 1 / 3, dimension: "volume" },
  cup: { canonical: "tbsp", factor: 16, dimension: "volume" },
  cups: { canonical: "tbsp", factor: 16, dimension: "volume" },
  qt: { canonical: "tbsp", factor: 64, dimension: "volume" },
  quart: { canonical: "tbsp", factor: 64, dimension: "volume" },
  quarts: { canonical: "tbsp", factor: 64, dimension: "volume" },
  gal: { canonical: "tbsp", factor: 256, dimension: "volume" },
  gallon: { canonical: "tbsp", factor: 256, dimension: "volume" },
  gallons: { canonical: "tbsp", factor: 256, dimension: "volume" },
  ml: { canonical: "tbsp", factor: 0.067628, dimension: "volume" },
  milliliter: { canonical: "tbsp", factor: 0.067628, dimension: "volume" },
  milliliters: { canonical: "tbsp", factor: 0.067628, dimension: "volume" },
  l: { canonical: "tbsp", factor: 67.628, dimension: "volume" },
  liter: { canonical: "tbsp", factor: 67.628, dimension: "volume" },
  liters: { canonical: "tbsp", factor: 67.628, dimension: "volume" },
  // count → ea
  ea: { canonical: "ea", factor: 1, dimension: "count" },
  each: { canonical: "ea", factor: 1, dimension: "count" },
  piece: { canonical: "ea", factor: 1, dimension: "count" },
  pieces: { canonical: "ea", factor: 1, dimension: "count" },
  pc: { canonical: "ea", factor: 1, dimension: "count" },
  pcs: { canonical: "ea", factor: 1, dimension: "count" },
};

export function canonicalize(rawUnit: string | null | undefined, qty: number): {
  unit: string | null;
  quantity: number;
  dimension: Dimension;
  converted: boolean;
} {
  if (!rawUnit) {
    return { unit: null, quantity: qty, dimension: "other", converted: false };
  }
  const k = String(rawUnit).toLowerCase().trim().replace(/\.$/, "");
  const conv = UNIT_CONVERSIONS[k];
  if (!conv) {
    return { unit: k || null, quantity: qty, dimension: "other", converted: false };
  }
  const converted = conv.canonical !== k || conv.factor !== 1;
  return {
    unit: conv.canonical,
    quantity: roundQty(qty * conv.factor, conv.canonical, conv.dimension),
    dimension: conv.dimension,
    converted,
  };
}

export function dimensionLabel(d: Dimension): string {
  switch (d) {
    case "weight": return "weight";
    case "volume": return "volume";
    case "count":  return "count";
    default:       return "";
  }
}

/**
 * Round a converted quantity to friendly precision so we never display long
 * floating-point tails like `24.000000003` or `0.0676280000` after lb→oz or
 * ml→tbsp conversions. Tiered by magnitude:
 *   ≥ 100  → whole number
 *   ≥ 10   → 1 decimal
 *   ≥ 1    → 2 decimals
 *   < 1    → 3 decimals (so 1 tsp ≈ 0.333 tbsp stays useful)
 *   exactly 0 → 0
 * For "count" / "ea" units we always round to whole numbers.
 */
export function roundQty(qty: number, unit?: string | null, dimension?: Dimension): number {
  if (!Number.isFinite(qty) || qty === 0) return 0;
  if (dimension === "count" || unit === "ea") return Math.round(qty);
  const abs = Math.abs(qty);
  let decimals: number;
  if (abs >= 100) decimals = 0;
  else if (abs >= 10) decimals = 1;
  else if (abs >= 1) decimals = 2;
  else decimals = 3;
  const f = 10 ** decimals;
  return Math.round(qty * f) / f;
}

/** Format a quantity for display: rounded + trailing zeros stripped. */
export function formatQty(qty: number, unit?: string | null, dimension?: Dimension): string {
  const rounded = roundQty(qty, unit, dimension);
  if (rounded === 0) return "0";
  // Strip trailing zeros (e.g. 24.00 → "24", 1.50 → "1.5").
  return String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

