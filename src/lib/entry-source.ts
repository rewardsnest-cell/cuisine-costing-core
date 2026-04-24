/**
 * Entry-source helpers — where did a recipe-email signup come from?
 * Auto-detect from utm_source / referrer; users can override on the form.
 */
export const ENTRY_SOURCES = [
  "facebook", "instagram", "tiktok", "youtube", "pinterest", "email", "direct", "other",
] as const;
export type EntrySource = typeof ENTRY_SOURCES[number];

export const ENTRY_SOURCE_LABELS: Record<EntrySource, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  email: "Email",
  direct: "Direct / typed URL",
  other: "Somewhere else",
};

const UTM_MAP: Record<string, EntrySource> = {
  facebook: "facebook", fb: "facebook", "facebook.com": "facebook",
  instagram: "instagram", ig: "instagram", "instagram.com": "instagram",
  tiktok: "tiktok", "tiktok.com": "tiktok",
  youtube: "youtube", yt: "youtube", "youtube.com": "youtube", "youtu.be": "youtube",
  pinterest: "pinterest", pin: "pinterest", "pinterest.com": "pinterest",
  email: "email", newsletter: "email", mail: "email",
};

function fromHostname(host: string | null): EntrySource | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const key of Object.keys(UTM_MAP)) {
    if (h === key || h.endsWith(`.${key}`)) return UTM_MAP[key];
  }
  return null;
}

/** Best-effort detection. Safe on server (returns "direct" when window is absent). */
export function detectEntrySource(): EntrySource {
  if (typeof window === "undefined") return "direct";
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = (params.get("utm_source") || "").toLowerCase().trim();
    if (utm && UTM_MAP[utm]) return UTM_MAP[utm];
    const ref = document.referrer ? new URL(document.referrer).hostname : null;
    return fromHostname(ref) ?? "direct";
  } catch {
    return "direct";
  }
}
