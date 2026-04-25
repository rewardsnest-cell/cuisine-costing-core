// Pricing v2 — weight parser. Pure, deterministic, no I/O.
// Goal: derive net_weight_grams from Kroger size strings. Anything ambiguous
// is reported as a structured failure so the caller can log a uniform error.

const G_PER_OZ = 28.349523125;
const G_PER_LB = 453.59237;
const G_PER_KG = 1000;

export type ParseFailureType =
  | "MISSING_SIZE"
  | "WEIGHT_PARSE_FAIL"
  | "VOLUME_ONLY"
  | "ZERO_OR_NEG_WEIGHT";

export type WeightParseResult =
  | { ok: true; net_weight_grams: number; matched: string; trace: string[] }
  | { ok: false; failure: ParseFailureType; reason: string; trace: string[] };

const VOLUME_RE = /\b(fl\s*oz|fluid\s*ounce|gallon|gal\b|liter|litre|\bml\b|\bl\b|pint|quart|qt\b|pt\b)/i;
const EACH_ONLY_RE = /\b(each|\bea\b|\bct\b|count|pack of \d+|\d+\s*(ct|count|pk|pack))\b/i;
const VARIES_RE = /\b(varies|random\s*weight|approx)/i;

// Patterns
const PARENS_GRAMS_RE = /\((\d+(?:\.\d+)?)\s*(g|grams?|kg|kilograms?)\)/i;
const MULT_RE = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|lb|lbs|pound|pounds|g|grams?|kg)/i;
const CT_OF_RE = /(\d+(?:\.\d+)?)\s*(?:ct|count|pk|pack)\s*(?:of|\/|x)?\s*(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|lb|lbs|pound|pounds|g|grams?|kg)/i;
const SIMPLE_RE = /(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|lb|lbs|pound|pounds|g|grams?|kg)\b/i;

function unitToGrams(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("oz") || u.startsWith("ounce")) return n * G_PER_OZ;
  if (u.startsWith("lb") || u.startsWith("pound")) return n * G_PER_LB;
  if (u === "kg" || u.startsWith("kilogram")) return n * G_PER_KG;
  // grams
  return n;
}

export function parseWeightToGrams(input: {
  size_raw?: string | null;
  payload_json?: Record<string, any> | null;
}): WeightParseResult {
  const trace: string[] = [];
  const raw = (input.size_raw ?? "").trim();

  // Walk through all "size" candidates from the payload as fallbacks.
  const candidates: string[] = [];
  if (raw) candidates.push(raw);
  const items = input.payload_json?.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (typeof it?.size === "string" && it.size.trim()) candidates.push(it.size.trim());
    }
  }
  if (!candidates.length) {
    return { ok: false, failure: "MISSING_SIZE", reason: "No size_raw and no items[].size present.", trace };
  }

  for (const text of candidates) {
    trace.push(`try: "${text}"`);

    // 1) Explicit grams in parens always wins.
    const paren = text.match(PARENS_GRAMS_RE);
    if (paren) {
      const n = parseFloat(paren[1]);
      const grams = unitToGrams(n, paren[2]);
      if (grams > 0) {
        return { ok: true, net_weight_grams: grams, matched: `parens:${paren[0]}`, trace };
      }
    }

    // 2) "2 x 16 oz" / "6 x 8 oz"
    const mult = text.match(MULT_RE);
    if (mult) {
      const total = parseFloat(mult[1]) * unitToGrams(parseFloat(mult[2]), mult[3]);
      if (total > 0) return { ok: true, net_weight_grams: total, matched: `mult:${mult[0]}`, trace };
    }

    // 3) "8 ct / 16 oz" / "6 pack of 8 oz"
    const cof = text.match(CT_OF_RE);
    if (cof) {
      const total = parseFloat(cof[1]) * unitToGrams(parseFloat(cof[2]), cof[3]);
      if (total > 0) return { ok: true, net_weight_grams: total, matched: `ctof:${cof[0]}`, trace };
    }

    // 4) Volume-only? Block before single-number match (avoid "1 gallon" parsing).
    if (VOLUME_RE.test(text) && !SIMPLE_RE.test(text.replace(VOLUME_RE, ""))) {
      return {
        ok: false,
        failure: "VOLUME_ONLY",
        reason: `"${text}" is a volume measure; weight-only pipeline.`,
        trace,
      };
    }

    // 5) Simple "16 oz" / "1 lb" / "340 g"
    const simple = text.match(SIMPLE_RE);
    if (simple) {
      const grams = unitToGrams(parseFloat(simple[1]), simple[2]);
      if (grams > 0) return { ok: true, net_weight_grams: grams, matched: `simple:${simple[0]}`, trace };
      return { ok: false, failure: "ZERO_OR_NEG_WEIGHT", reason: `Parsed weight ≤ 0 from "${text}".`, trace };
    }

    // 6) "varies" / "random weight"
    if (VARIES_RE.test(text)) {
      return { ok: false, failure: "WEIGHT_PARSE_FAIL", reason: `"${text}" is variable/random weight.`, trace };
    }

    // 7) "each" / "ct" with no weight
    if (EACH_ONLY_RE.test(text)) {
      return { ok: false, failure: "WEIGHT_PARSE_FAIL", reason: `"${text}" is count-only with no weight.`, trace };
    }
  }

  return { ok: false, failure: "WEIGHT_PARSE_FAIL", reason: `Could not parse any candidate: ${candidates.join(" | ")}`, trace };
}
