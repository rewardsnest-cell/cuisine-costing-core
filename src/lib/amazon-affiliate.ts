/**
 * Amazon affiliate link helpers.
 *
 * The associate tag (e.g. "vpsfinest-20") is stored in the `app_kv` table
 * under the key `amazon_associate_tag`. We never hardcode it — admins set it
 * once via the Cooking Lab admin page and every outbound Amazon link picks
 * it up automatically.
 *
 * Why client-side rewrite (not stored in the DB URL):
 * - Editors paste clean Amazon URLs from their browser; they should not have
 *   to remember the tag.
 * - If the tag ever changes (new associate account, different program), all
 *   links update instantly with zero data migration.
 * - Tag is appended at render time so the DB stores the canonical product URL.
 */

const AMAZON_HOSTS_WITH_TAG = new Set([
  "amazon.com",
  "www.amazon.com",
  "smile.amazon.com",
  "amazon.co.uk",
  "www.amazon.co.uk",
  "amazon.ca",
  "www.amazon.ca",
]);

/**
 * Amazon OneLink — international redirect.
 *
 * When a visitor outside the US clicks an amazon.com affiliate link, OneLink
 * (configured in Associates Central) automatically redirects them to their
 * local Amazon storefront and credits the same associate. We don't need to
 * change the URL ourselves; we just need to make sure:
 *   1. The link points at a OneLink-supported host (amazon.com works best).
 *   2. The `tag` parameter is present so OneLink can map it to the regional
 *      associate ID.
 *
 * `withOneLinkRedirect` normalizes a regional Amazon URL back to amazon.com
 * by ASIN so OneLink can do its job. If the URL is already amazon.com or we
 * can't extract an ASIN, the original URL is returned untouched.
 */
export function withOneLinkRedirect(rawUrl: string | null | undefined): string {
  const input = (rawUrl ?? "").trim();
  if (!input) return "";
  if (!isTaggableAmazonUrl(input)) return input;
  try {
    const u = new URL(input);
    // If already on amazon.com, nothing to do.
    if (u.hostname === "amazon.com" || u.hostname === "www.amazon.com") return input;
    const asin = extractAmazonAsin(input);
    if (!asin) return input;
    const out = new URL(`https://www.amazon.com/dp/${asin}`);
    const tag = u.searchParams.get("tag");
    if (tag) out.searchParams.set("tag", tag);
    return out.toString();
  } catch {
    return input;
  }
}

/** Returns true if the URL is an Amazon product URL we can tag. */
export function isTaggableAmazonUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return AMAZON_HOSTS_WITH_TAG.has(host);
  } catch {
    return false;
  }
}

/**
 * Append (or replace) the Amazon `tag` query parameter and standard tracking
 * params. Returns the original URL unchanged if it's not a valid Amazon URL
 * or no tag is provided. amzn.to short links are returned as-is because the
 * tag is baked into the short link itself.
 */
export function withAmazonAffiliateTag(
  rawUrl: string | null | undefined,
  associateTag: string | null | undefined,
): string {
  if (!rawUrl) return "";
  const url = rawUrl.trim();
  if (!url) return "";
  if (!associateTag || !associateTag.trim()) return url;
  if (!isTaggableAmazonUrl(url)) return url;

  try {
    const u = new URL(url);
    u.searchParams.set("tag", associateTag.trim());
    // Standard Amazon tracking params — harmless if duplicated, useful for analytics.
    if (!u.searchParams.has("linkCode")) u.searchParams.set("linkCode", "ll1");
    if (!u.searchParams.has("language")) u.searchParams.set("language", "en_US");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Extracts the 10-character Amazon ASIN from any Amazon URL shape we know
 * about (path-based: /dp/, /gp/product/, /gp/aw/d/, /exec/obidos/ASIN/, /o/;
 * query-based: ?asin=). Returns null when no ASIN can be located. Pure string
 * parsing — no network calls, safe to call on every render.
 */
export function extractAmazonAsin(rawUrl: string | null | undefined): string | null {
  const input = (rawUrl ?? "").trim();
  if (!input) return null;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    try {
      parsed = new URL("https://" + input);
    } catch {
      return null;
    }
  }
  const pathMatch = parsed.pathname.match(
    /\/(?:dp|gp\/product|gp\/aw\/d|product|exec\/obidos\/(?:asin|ASIN)|o|dp\/product)\/([A-Z0-9]{10})/i,
  );
  if (pathMatch) return pathMatch[1].toUpperCase();
  const qAsin = parsed.searchParams.get("asin") ?? parsed.searchParams.get("ASIN");
  if (qAsin && /^[A-Z0-9]{10}$/i.test(qAsin)) return qAsin.toUpperCase();
  const anyMatch = (parsed.pathname + " " + parsed.search).match(
    /(?:^|[/?&=#-])([A-Z0-9]{10})(?=[/?&#]|$)/i,
  );
  return anyMatch ? anyMatch[1].toUpperCase() : null;
}

/**
 * Result of attempting to normalize a pasted Amazon URL into a clean
 * `https://www.amazon.com/dp/ASIN` form. `changed` is true when we actually
 * rewrote something; `reason` explains what happened (for toast feedback).
 *
 * We deliberately do NOT follow shortener redirects (amzn.to, bit.ly, a.co):
 * that requires a network call and CORS blocks it from the browser. Editors
 * are told to expand short links themselves — autoFix only handles patterns
 * we can normalize purely from the URL string.
 */
export type AutoFixAmazonResult = {
  url: string;
  changed: boolean;
  reason: string;
};

const ASIN_RE = /(?:^|[/?&=#-])([A-Z0-9]{10})(?=[/?&#]|$)/i;

/**
 * Best-effort normalization of common Amazon URL shapes into the canonical
 * `https://www.amazon.com/dp/ASIN` form.
 *
 * Handles:
 * - http://… → https://…
 * - smile.amazon.com / m.amazon.com / amazon.com (no www) → www.amazon.com
 * - /gp/product/ASIN, /gp/aw/d/ASIN, /exec/obidos/ASIN/, /o/ASIN/, /dp/product/ASIN
 *   → /dp/ASIN
 * - URLs with ASIN buried in query string (e.g. ?asin=XXXX) → /dp/ASIN
 * - Strips noisy query params (ref, ref_, pf_rd_*, _encoding, psc, th, etc.)
 *   while preserving the affiliate `tag` if present.
 *
 * Refuses (returns unchanged + reason):
 * - Non-Amazon hosts
 * - Shorteners we cannot expand client-side (amzn.to, a.co, bit.ly)
 * - URLs where no 10-char ASIN can be located
 */
export function autoFixAmazonUrl(rawUrl: string | null | undefined): AutoFixAmazonResult {
  const input = (rawUrl ?? "").trim();
  if (!input) return { url: "", changed: false, reason: "Empty URL — nothing to fix." };

  // Try parsing as-is, then with https:// prefix if the user pasted bare host.
  let parsed: URL | null = null;
  try {
    parsed = new URL(input);
  } catch {
    try {
      parsed = new URL("https://" + input);
    } catch {
      return { url: input, changed: false, reason: "Could not parse URL." };
    }
  }

  const host = parsed.hostname.toLowerCase();

  // Shorteners — we can't resolve them without a network call.
  if (
    host === "amzn.to" ||
    host === "a.co" ||
    host === "amzn.com" ||
    host === "bit.ly" ||
    host === "tinyurl.com"
  ) {
    return {
      url: input,
      changed: false,
      reason: `Cannot auto-expand short link (${host}). Open it in a browser and paste the full /dp/ URL.`,
    };
  }

  // Must be an Amazon host (any TLD) to proceed.
  const isAmazon =
    host === "amazon.com" ||
    host === "www.amazon.com" ||
    host === "smile.amazon.com" ||
    host === "m.amazon.com" ||
    host.endsWith(".amazon.com") ||
    host === "amazon.co.uk" ||
    host === "www.amazon.co.uk" ||
    host === "amazon.ca" ||
    host === "www.amazon.ca";
  if (!isAmazon) {
    return { url: input, changed: false, reason: `Host "${host}" is not an Amazon domain.` };
  }

  // Locate ASIN: try common path patterns first, then query/fragment scan.
  const path = parsed.pathname;
  let asin: string | null = null;

  const pathMatch = path.match(
    /\/(?:dp|gp\/product|gp\/aw\/d|product|exec\/obidos\/(?:asin|ASIN)|o|dp\/product)\/([A-Z0-9]{10})/i,
  );
  if (pathMatch) {
    asin = pathMatch[1];
  } else {
    // Fallback: any 10-char A-Z/0-9 token in path or query.
    const qAsin = parsed.searchParams.get("asin") ?? parsed.searchParams.get("ASIN");
    if (qAsin && /^[A-Z0-9]{10}$/i.test(qAsin)) {
      asin = qAsin;
    } else {
      const anyMatch = (path + " " + parsed.search).match(ASIN_RE);
      if (anyMatch) asin = anyMatch[1];
    }
  }

  if (!asin) {
    return {
      url: input,
      changed: false,
      reason: "No ASIN (10-char product ID) found in URL.",
    };
  }

  // Choose canonical host — keep TLD if user pasted a regional Amazon.
  let canonicalHost = "www.amazon.com";
  if (host.endsWith(".co.uk") || host === "amazon.co.uk") canonicalHost = "www.amazon.co.uk";
  else if (host.endsWith(".ca") || host === "amazon.ca") canonicalHost = "www.amazon.ca";

  const canonical = new URL(`https://${canonicalHost}/dp/${asin.toUpperCase()}`);

  // Preserve the affiliate `tag` if the editor pasted a pre-tagged URL.
  const existingTag = parsed.searchParams.get("tag");
  if (existingTag) canonical.searchParams.set("tag", existingTag);

  const newUrl = canonical.toString();
  if (newUrl === input) {
    return { url: input, changed: false, reason: "Already in canonical /dp/ASIN form." };
  }
  return {
    url: newUrl,
    changed: true,
    reason: `Normalized to /dp/${asin.toUpperCase()}.`,
  };
}
