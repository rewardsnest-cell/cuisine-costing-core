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
