import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Shared Kroger ingest primitives — used by both the admin server functions
 * (`kroger-pricing.functions.ts`) and the cron-only worker
 * (`kroger-ingest-internal.ts`).
 *
 * Owns:
 *  - In-memory OAuth2 token cache (refreshes 60s before expiry)
 *  - 429/503 fetch backoff
 *  - ZIP → locationId resolution (cached in app_kv for 30 days)
 *  - Per-unit normalization with promo/regular separation + quarantine signals
 *  - Confidence scoring for SKU → ingredient_reference matches
 *
 * SECURITY:
 *  - Tokens live only in module memory. They are never persisted and never
 *    leave this module (no caller receives the raw token).
 *  - All caller surfaces accept a bound `kFetch` instead of the token itself.
 */

// HARD-CODED Kroger location: Cincinnati 45202 (Kroger HQ market). All
// pricing pulls — admin and cron — resolve to this ZIP. Override args are
// ignored everywhere downstream so we get one consistent pricing source.
export const KROGER_DEFAULT_ZIP = "45202";
export const KROGER_HARDCODED_ZIP = "45202";

// ─────────────────────────── Token manager ────────────────────────────
// Cached in module memory only — never written to the database, never
// returned to callers.
let _cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_REFRESH_MARGIN_MS = 60_000; // refresh 60s before expiry

async function fetchFreshToken(): Promise<{ value: string; expiresAt: number }> {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Kroger API keys not configured (KROGER_CLIENT_ID / KROGER_CLIENT_SECRET).");
  }
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // FATAL — caller must abort the run.
    throw new Error(`Kroger token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Kroger token response missing access_token");
  const ttlMs = (Number(json.expires_in) || 1800) * 1000; // default 30 min
  return { value: json.access_token, expiresAt: Date.now() + ttlMs };
}

/**
 * Returns a bound fetch function that injects a fresh OAuth bearer token
 * and applies 429/503 backoff. The raw token never escapes this module.
 *
 * Throws a fatal error if the token cannot be obtained — the caller
 * should abort the ingest run.
 */
export async function getKrogerFetch(): Promise<(url: string, init?: RequestInit) => Promise<Response>> {
  if (!_cachedToken || Date.now() + TOKEN_REFRESH_MARGIN_MS >= _cachedToken.expiresAt) {
    _cachedToken = await fetchFreshToken();
  }
  const token = _cachedToken.value;

  return async function kFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const res = await fetch(url, { ...init, headers });

    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30000)
        : Math.min(500 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, waitMs));
      return kFetch(url, init, attempt + 1);
    }
    return res;
  };
}

// ─────────────────────────── Location resolver ────────────────────────────

async function getKv(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_kv").select("value").eq("key", key).maybeSingle();
  return (data as any)?.value ?? null;
}

// `getSavedKrogerLocationId` was removed: per pricing intent, there is no
// admin-pinned location. Locations are derived from ZIP only.

/**
 * Kroger's Product API requires `filter.locationId` to be EXACTLY 8
 * alphanumeric characters (e.g. "540FC008"). Anything else (5-digit ZIP,
 * lowercase, hyphens, empty) causes the API to reject the request with
 * `PRODUCT-2011`. Use this guard everywhere a locationId is consumed.
 */
export const KROGER_LOCATION_ID_REGEX = /^[A-Za-z0-9]{8}$/;
export function isValidKrogerLocationId(id: string | null | undefined): id is string {
  return typeof id === "string" && KROGER_LOCATION_ID_REGEX.test(id);
}

/**
 * Resolve a Kroger locationId from a US ZIP code.
 * Caches the answer in app_kv for 30 days. Returns null when no location
 * can be found — callers MUST abort the run in that case.
 */
export async function resolveLocationFromZip(
  zip: string,
  kFetch: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> {
  const cleanZip = (zip || "").trim();
  if (!/^\d{5}$/.test(cleanZip)) return null;

  const cacheKey = `kroger_location_for_zip:${cleanZip}`;
  const cached = await getKv(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { locationId: string; cachedAt: string };
      const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
      // Defensive: only honor cache if stored id passes the 8-char rule.
      // Older runs cached invalid 5-digit ZIPs (e.g. "44870") that broke
      // every downstream Product API call with PRODUCT-2011.
      if (ageMs < 30 * 86400000 && isValidKrogerLocationId(parsed.locationId)) {
        return parsed.locationId;
      }
    } catch { /* refresh */ }
  }

  // Fetch several nearby locations and pick the FIRST one that actually
  // returns products. Some `locationId`s belong to distribution sheds /
  // back-office facilities (e.g. "Cleveland Shed") which validate against
  // the format check but return `{"data":[]}` for every product search.
  // Probing once up front avoids thousands of doomed Product API calls.
  const url = new URL("https://api.kroger.com/v1/locations");
  url.searchParams.set("filter.zipCode.near", cleanZip);
  url.searchParams.set("filter.limit", "10");
  const res = await kFetch(url.toString());
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    data?: Array<{ locationId?: string; name?: string; chain?: string }>;
  } | null;
  const candidates = (body?.data ?? []).filter((l) => isValidKrogerLocationId(l.locationId));
  if (candidates.length === 0) return null;

  // De-prioritize obvious non-retail facilities by name. We still PROBE them
  // last so a misnamed retail store isn't excluded.
  const NON_RETAIL_RE = /\b(shed|warehouse|distribution|fulfillment|depot|office|corporate)\b/i;
  candidates.sort((a, b) => {
    const aBad = NON_RETAIL_RE.test(a.name ?? "") ? 1 : 0;
    const bBad = NON_RETAIL_RE.test(b.name ?? "") ? 1 : 0;
    return aBad - bBad;
  });

  let chosen: string | null = null;
  for (const cand of candidates) {
    const id = cand.locationId!;
    const probe = new URL("https://api.kroger.com/v1/products");
    probe.searchParams.set("filter.term", "milk");
    probe.searchParams.set("filter.locationId", id);
    probe.searchParams.set("filter.limit", "1");
    try {
      const pRes = await kFetch(probe.toString());
      if (!pRes.ok) continue;
      const pBody = (await pRes.json().catch(() => null)) as { data?: any[] } | null;
      if ((pBody?.data?.length ?? 0) > 0) {
        chosen = id;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!chosen) return null;

  await supabaseAdmin.from("app_kv").upsert({
    key: cacheKey,
    value: JSON.stringify({ locationId: chosen, cachedAt: new Date().toISOString() }),
    updated_at: new Date().toISOString(),
  });
  return chosen;
}

/**
 * Resolve the locationId for a run.
 *
 * PRICING INTENT: humans cannot pin a Kroger location. The previous saved
 * `kroger_location_id` override has been removed. We always derive from the
 * passed ZIP (default 44202) via the Locations API and rely on the 30-day
 * ZIP-keyed cache. The `override` argument is kept only for cron payloads
 * that pass an explicit ZIP-derived value through; it is NOT exposed to
 * any admin UI surface.
 *
 * Returns null if the Locations API can't resolve the ZIP, OR if the
 * resolved/override id fails the 8-char alphanumeric format. Callers MUST
 * abort the run when null.
 */
export async function resolveRunLocationId(
  override: string | null | undefined,
  zip: string,
  kFetch: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> {
  if (override && override.trim()) {
    const trimmed = override.trim();
    return isValidKrogerLocationId(trimmed) ? trimmed : null;
  }
  return resolveLocationFromZip(zip, kFetch);
}

// ─────────────────────────── Normalization engine ────────────────────────────

export type CanonicalUnit = "lb" | "oz" | "fl_oz" | "ml" | "l" | "gal" | "g" | "kg" | "each";

export type NormalizedPrice = {
  /** Per-unit price in `canonicalUnit`. */
  unitPrice: number;
  canonicalUnit: CanonicalUnit | string;
  /** The raw, un-normalized package price as observed from Kroger. */
  rawPackagePrice: number;
  /** True when the observed price came from `price.promo`, not `price.regular`. */
  isPromo: boolean;
  /** Set when the size string couldn't be parsed; SKU should be quarantined. */
  quarantineReason?: string;
};

const CANONICAL_UNIT_BY_TOKEN: Record<string, CanonicalUnit> = {
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz",
  floz: "fl_oz",
  ml: "ml",
  l: "l", liter: "l", liters: "l",
  gal: "gal", gallon: "gal",
  g: "g",
  kg: "kg",
  ct: "each", count: "each", ea: "each", each: "each",
};

/**
 * Normalize a Kroger product price into a canonical per-unit value.
 *
 * Rules:
 *   - Zero or null prices return `null` (caller must DISCARD, not write).
 *   - When promo > 0, promo wins as the observed price (but `isPromo=true`
 *     so callers can record it without it overwriting non-promo signals
 *     in the pricing model).
 *   - When the size string can't be parsed, returns a quarantine record
 *     with `unitPrice = rawPackagePrice` so the caller can flag the SKU.
 */
export function normalizeKrogerPrice(input: {
  regularPrice: number | null;
  promoPrice: number | null;
  sizeText: string | null;
  density_g_per_ml?: number | null;
}): NormalizedPrice | null {
  const regular = typeof input.regularPrice === "number" && input.regularPrice > 0 ? input.regularPrice : null;
  const promo = typeof input.promoPrice === "number" && input.promoPrice > 0 ? input.promoPrice : null;
  if (regular == null && promo == null) return null; // discard zero/null

  const observed = (promo ?? regular)!;
  const isPromo = promo != null;
  const sizeText = (input.sizeText ?? "").toLowerCase().trim();

  if (!sizeText) {
    return {
      unitPrice: observed,
      canonicalUnit: "each",
      rawPackagePrice: observed,
      isPromo,
      quarantineReason: "no_size_string",
    };
  }

  const m = sizeText.match(/([\d.]+)\s*(fl\s*oz|lbs|pounds|pound|liters|liter|gallon|count|each|oz|lb|gal|kg|ml|ct|ea|g|l)\b/);
  if (!m) {
    return {
      unitPrice: observed,
      canonicalUnit: "each",
      rawPackagePrice: observed,
      isPromo,
      quarantineReason: `unparseable_size:${sizeText.slice(0, 32)}`,
    };
  }

  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      unitPrice: observed,
      canonicalUnit: "each",
      rawPackagePrice: observed,
      isPromo,
      quarantineReason: `bad_qty:${m[1]}`,
    };
  }

  const token = m[2].replace(/\s+/g, "");
  const canonicalUnit: CanonicalUnit = CANONICAL_UNIT_BY_TOKEN[token] ?? "each";

  return {
    unitPrice: Number((observed / qty).toFixed(4)),
    canonicalUnit,
    rawPackagePrice: observed,
    isPromo,
  };
}

// ─────────────────────────── SKU confidence scoring ────────────────────────────

/**
 * Score 0..1 for a Kroger product → ingredient_reference candidate match.
 * 0.9+  exact UPC or normalized name match
 * 0.6+  strong substring (one fully contained in the other)
 * 0.3+  shared significant tokens (≥2)
 * <0.3  weak — kept as `auto`, not surfaced for confirmation
 */
export function scoreSkuMatch(input: {
  productUpc?: string | null;
  productName: string;
  candidateUpc?: string | null;
  candidateName: string;
}): number {
  if (input.productUpc && input.candidateUpc && input.productUpc === input.candidateUpc) return 1;

  const a = normalizeForScoring(input.productName);
  const b = normalizeForScoring(input.candidateName);
  if (!a || !b) return 0;
  if (a === b) return 0.95;
  if (a.includes(b) || b.includes(a)) return 0.7;

  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 3));
  const bTokens = new Set(b.split(" ").filter((t) => t.length >= 3));
  const shared = [...aTokens].filter((t) => bTokens.has(t)).length;
  if (shared >= 2) return Math.min(0.6, 0.3 + 0.1 * shared);
  if (shared === 1) return 0.25;
  return 0;
}

export function normalizeForScoring(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// ─────────────────────────── Bootstrap search terms ────────────────────────────

/**
 * Search terms used by catalog_bootstrap mode: a-z + 0-9.
 * Intentionally simple — the Kroger Product API returns the broadest result
 * set on a single character, and dedup by SKU keeps duplicates out of
 * kroger_sku_map.
 */
// Kroger /products requires filter.term to be >= 3 characters; single chars
// return HTTP 400. Use broad grocery category keywords to maximize SKU
// discovery during bootstrap. Order is roughly highest-volume first so early
// runs hit the most common ingredients before any item cap.
export const BOOTSTRAP_SEARCH_TERMS: string[] = [
  // Proteins
  "chicken", "beef", "pork", "turkey", "bacon", "sausage", "ham", "steak",
  "ground beef", "salmon", "tuna", "shrimp", "fish", "eggs", "tofu",
  // Dairy
  "milk", "cheese", "butter", "yogurt", "cream", "sour cream", "cream cheese",
  "mozzarella", "cheddar", "parmesan", "half and half",
  // Produce
  "apple", "banana", "orange", "grape", "berry", "strawberry", "blueberry",
  "lemon", "lime", "avocado", "tomato", "potato", "onion", "garlic", "carrot",
  "celery", "lettuce", "spinach", "broccoli", "pepper", "cucumber", "mushroom",
  "corn", "kale", "cabbage", "zucchini", "squash", "ginger",
  // Pantry / dry goods
  "rice", "pasta", "bread", "flour", "sugar", "salt", "olive oil", "vegetable oil",
  "vinegar", "soy sauce", "honey", "syrup", "oats", "cereal", "beans", "lentils",
  "tortilla", "crackers", "peanut butter", "jelly", "jam",
  // Canned & jarred
  "soup", "broth", "tomato sauce", "salsa", "ketchup", "mustard", "mayo",
  "pickles", "olives", "tuna can", "canned beans", "canned tomatoes",
  // Beverages
  "coffee", "tea", "juice", "soda", "water", "sparkling water", "energy drink",
  "almond milk", "oat milk",
  // Frozen
  "frozen pizza", "frozen vegetables", "ice cream", "frozen chicken",
  "frozen fruit", "frozen meal",
  // Bakery / snacks / sweets
  "chips", "cookies", "candy", "chocolate", "nuts", "popcorn", "granola",
  "bagel", "muffin", "donut",
  // Spices / baking
  "spice", "pepper black", "cinnamon", "vanilla", "baking soda", "baking powder",
  "yeast", "cocoa",
];
