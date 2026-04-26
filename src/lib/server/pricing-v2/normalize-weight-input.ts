// Pricing v2 — normalize a manually entered weight string into grams.
// Pure, deterministic, no I/O. Mirrors weight-parser unit math.

const G_PER_OZ = 28.349523125;
const G_PER_LB = 453.59237;
const G_PER_KG = 1000;

export type NormalizeResult =
  | { ok: true; grams: number; unit: "g" | "kg" | "oz" | "lb"; raw_value: number; matched: string }
  | { ok: false; reason: string };

/**
 * Accepts:
 *   "454"              → grams (default unit)
 *   "454 g" / "454g"   → grams
 *   "0.45 kg"          → kg → grams
 *   "16 oz"            → oz → grams
 *   "1.5 lb" / "1.5lbs"→ lb → grams
 * Rejects negatives, zero, NaN, multi-token expressions, volume units.
 */
export function normalizeWeightInput(input: string): NormalizeResult {
  if (typeof input !== "string") return { ok: false, reason: "Weight must be a string." };
  const s = input.trim().toLowerCase();
  if (!s) return { ok: false, reason: "Weight is empty." };

  // Reject volume units explicitly — this pipeline is weight-only.
  if (/\b(fl\s*oz|fluid|gallon|gal|liter|litre|ml|pint|quart|qt|pt)\b/.test(s)) {
    return { ok: false, reason: "Volume units are not allowed; enter a weight (g, kg, oz, lb)." };
  }

  // Reject multiplicative or "x" expressions — too ambiguous for a manual override.
  if (/[x×]/.test(s) || /\bof\b/.test(s)) {
    return { ok: false, reason: "Enter a single weight value (e.g. 454 g, 1.5 lb)." };
  }

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|kg|kilograms?|oz|ounces?|lb|lbs|pounds?)?$/);
  if (!m) return { ok: false, reason: "Could not parse weight. Use a number with optional unit (g, kg, oz, lb)." };

  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "Weight must be greater than zero." };

  let unit: "g" | "kg" | "oz" | "lb" = "g";
  let grams = n;
  const u = (m[2] ?? "").toLowerCase();
  if (u.startsWith("kg") || u.startsWith("kilogram")) { unit = "kg"; grams = n * G_PER_KG; }
  else if (u.startsWith("oz") || u.startsWith("ounce")) { unit = "oz"; grams = n * G_PER_OZ; }
  else if (u.startsWith("lb") || u.startsWith("pound")) { unit = "lb"; grams = n * G_PER_LB; }
  else { unit = "g"; grams = n; }

  if (grams > 1_000_000) return { ok: false, reason: "Weight is unreasonably large (>1,000 kg)." };

  return { ok: true, grams, unit, raw_value: n, matched: m[0] };
}

/**
 * Compare the manual grams value against what we can derive from size_raw.
 * Returns null if no comparison is possible (no parseable size).
 * Returns { consistent, ratio } otherwise.
 */
export function compareWithSizeRaw(
  manualGrams: number,
  parsedFromSize: { ok: true; net_weight_grams: number } | { ok: false } | null,
): { comparable: false } | { comparable: true; consistent: boolean; ratio: number; parsed_grams: number } {
  if (!parsedFromSize || !parsedFromSize.ok) return { comparable: false };
  const parsed = parsedFromSize.net_weight_grams;
  if (parsed <= 0 || manualGrams <= 0) return { comparable: false };
  const ratio = manualGrams / parsed;
  // Allow ±15% tolerance — packaging weight vs. labeled net weight differs.
  const consistent = ratio >= 0.85 && ratio <= 1.15;
  return { comparable: true, consistent, ratio, parsed_grams: parsed };
}
