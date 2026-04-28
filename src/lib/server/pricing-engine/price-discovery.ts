// Pricing Engine v3 — dynamic price-field discovery.
// The Grocery Pricing API response shape varies. We recursively walk the JSON
// looking for a numeric value whose key/path is most "price-like".

const PRICE_KEY_HINTS = [
  "price", "amount", "cost", "offer", "buy", "pricing", "sale", "current_price",
  "regular_price", "list_price", "unit_price", "value",
];
const NEGATIVE_HINTS = [
  "id", "rating", "ratings", "count", "review", "reviews", "timestamp",
  "stock", "inventory", "quantity_in_stock", "year", "page", "index",
  "sku_count", "store_count", "lat", "lon", "longitude", "latitude",
];
const UNIT_KEY_HINTS = ["unit", "uom", "size", "weight", "amount_unit", "package_size"];

export type PriceCandidate = {
  value: number;
  path: string;
  unitHint?: string | null;
  score: number;
};

function pathScore(pathLower: string, key: string): number {
  let score = 0;
  for (const h of PRICE_KEY_HINTS) {
    if (key.includes(h)) score += 5;
    if (pathLower.includes(h)) score += 2;
  }
  for (const n of NEGATIVE_HINTS) {
    if (key === n || key.endsWith("_" + n)) score -= 10;
    else if (key.includes(n)) score -= 4;
  }
  return score;
}

function plausiblePrice(v: number): boolean {
  // Anything between 1 cent and $9999 is plausible for a grocery item price.
  return Number.isFinite(v) && v > 0.01 && v < 9999;
}

function findUnitNear(parent: any): string | null {
  if (!parent || typeof parent !== "object") return null;
  for (const k of Object.keys(parent)) {
    const lk = k.toLowerCase();
    if (UNIT_KEY_HINTS.some((h) => lk.includes(h))) {
      const v = (parent as any)[k];
      if (typeof v === "string" && v.length < 32) return v;
    }
  }
  return null;
}

export function discoverPrices(json: unknown): PriceCandidate[] {
  const out: PriceCandidate[] = [];

  function walk(node: unknown, path: string, parent: any) {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, node));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, node);
      }
      return;
    }
    // primitives
    let num: number | null = null;
    if (typeof node === "number") num = node;
    else if (typeof node === "string") {
      const cleaned = node.replace(/[^\d.\-]/g, "");
      if (cleaned && /^\d+(\.\d+)?$/.test(cleaned)) num = parseFloat(cleaned);
    }
    if (num == null || !plausiblePrice(num)) return;

    const lastKey = path.split(/[.\[]/).pop()!.replace(/\]$/, "").toLowerCase();
    const score = pathScore(path.toLowerCase(), lastKey);
    if (score <= 0) return;

    out.push({
      value: num,
      path,
      unitHint: findUnitNear(parent),
      score,
    });
  }

  walk(json, "", null);
  // sort highest score first, prefer smaller (more atomic) prices on ties
  out.sort((a, b) => (b.score - a.score) || (a.value - b.value));
  return out;
}

export function pickBestPrice(json: unknown): PriceCandidate | null {
  const cands = discoverPrices(json);
  return cands[0] ?? null;
}

export function confidenceFromScore(score: number, totalCandidates: number): number {
  // Map score -> 0..1 confidence. Higher score & fewer competing candidates = more confident.
  const base = Math.min(1, score / 20);
  const competition = totalCandidates > 1 ? Math.max(0.5, 1 - (totalCandidates - 1) * 0.05) : 1;
  return Math.round(base * competition * 1000) / 1000;
}
