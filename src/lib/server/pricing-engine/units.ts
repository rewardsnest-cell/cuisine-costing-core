// Pricing Engine v3 — base-unit conversion.
// Canonical base units accepted by pe_ingredients.base_unit:
//   weight: lb, oz, g, kg
//   volume: ml, l, fl oz, cup, tbsp, tsp
//   count:  each

const WEIGHT_TO_LB: Record<string, number> = {
  lb: 1, lbs: 1, pound: 1, pounds: 1,
  oz: 1 / 16, ounce: 1 / 16, ounces: 1 / 16,
  g: 1 / 453.592, gram: 1 / 453.592, grams: 1 / 453.592,
  kg: 2.20462, kilogram: 2.20462, kilograms: 2.20462,
};

const VOLUME_TO_FLOZ: Record<string, number> = {
  "fl oz": 1, floz: 1, "fluid ounce": 1, "fluid ounces": 1,
  cup: 8, cups: 8, c: 8,
  tbsp: 0.5, tablespoon: 0.5, tablespoons: 0.5,
  tsp: 1 / 6, teaspoon: 1 / 6, teaspoons: 1 / 6,
  pt: 16, pint: 16, pints: 16,
  qt: 32, quart: 32, quarts: 32,
  gal: 128, gallon: 128, gallons: 128,
  ml: 0.033814, milliliter: 0.033814, milliliters: 0.033814,
  l: 33.814, liter: 33.814, liters: 33.814, litre: 33.814,
};

const COUNT: Record<string, number> = {
  each: 1, ea: 1, piece: 1, pieces: 1, whole: 1, unit: 1, units: 1,
  clove: 1, cloves: 1, slice: 1, slices: 1, head: 1, heads: 1,
  bunch: 1, bunches: 1, sprig: 1, sprigs: 1,
};

export function normalizeUnit(u: string | null | undefined): string {
  return (u ?? "").toLowerCase().trim().replace(/\.$/, "");
}

/**
 * Convert `qty fromUnit` -> equivalent qty in `toUnit`.
 * Returns null when units belong to different dimensions.
 */
export function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return qty;

  if (from in WEIGHT_TO_LB && to in WEIGHT_TO_LB) {
    return (qty * WEIGHT_TO_LB[from]) / WEIGHT_TO_LB[to];
  }
  if (from in VOLUME_TO_FLOZ && to in VOLUME_TO_FLOZ) {
    return (qty * VOLUME_TO_FLOZ[from]) / VOLUME_TO_FLOZ[to];
  }
  if (from in COUNT && to in COUNT) {
    return (qty * COUNT[from]) / COUNT[to];
  }
  return null;
}

export const ALLOWED_BASE_UNITS = [
  "lb", "oz", "g", "kg", "ml", "l", "fl oz", "cup", "tbsp", "tsp", "each",
] as const;
export type BaseUnit = (typeof ALLOWED_BASE_UNITS)[number];
