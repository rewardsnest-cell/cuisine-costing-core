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
    quantity: Math.round(qty * conv.factor * 100) / 100,
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
