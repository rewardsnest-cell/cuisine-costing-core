/**
 * Shared Cooking Lab entry validation — pure functions, no React/DOM deps.
 *
 * Used by BOTH:
 *   • the admin UI (live keystroke feedback + publish-button gating), and
 *   • the server function `saveCookingLabEntry` (authoritative re-check on save).
 *
 * Why duplicate-proof: every check that gates publishing lives here. The client
 * uses it for UX; the server uses it as the source of truth. A user editing
 * client code or calling the API directly cannot bypass publish gating because
 * the server re-runs `validateCookingLabEntryForPublish` and refuses to flip
 * status to "published" if anything fails.
 */
export type CookingLabEntryInput = {
  id?: string;
  title: string;
  description: string;
  status: "draft" | "published";
  primary_tool_name: string | null;
  primary_tool_url: string | null;
  secondary_tool_name: string | null;
  secondary_tool_url: string | null;
  qa_copy_reviewed: boolean;
  qa_video_loads: boolean;
  qa_image_loads: boolean;
  qa_links_tested: boolean;
  qa_ready: boolean;
  // Other fields exist on the row but are not gated; we accept them via index.
  [key: string]: unknown;
};

export type LinkCheck = {
  id: string;
  label: string;
  status: "ok" | "warning" | "error" | "empty";
  message: string;
};

export type ToolSlotKey =
  | "primary_tool_name" | "primary_tool_url"
  | "secondary_tool_name" | "secondary_tool_url";

export type ToolFieldErrors = Partial<Record<ToolSlotKey, string | null>>;

type ToolSlot = {
  id: string;
  label: string;
  nameKey: Extract<ToolSlotKey, `${string}_tool_name`>;
  urlKey: Extract<ToolSlotKey, `${string}_tool_url`>;
  required: boolean;
};

export const TOOL_SLOTS: ToolSlot[] = [
  { id: "primary",   label: "Primary tool link",   nameKey: "primary_tool_name",   urlKey: "primary_tool_url",   required: true  },
  { id: "secondary", label: "Secondary tool link", nameKey: "secondary_tool_name", urlKey: "secondary_tool_url", required: false },
];

const AMAZON_HOSTS = [
  "amazon.com", "www.amazon.com", "smile.amazon.com",
  "amazon.co.uk", "www.amazon.co.uk",
  "amazon.ca", "www.amazon.ca",
  "amzn.to",
];
const SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly"];

export function validateAmazonLink(args: {
  id: string; label: string; name: string | null; url: string | null; required: boolean;
}): LinkCheck {
  const { id, label, name, url, required } = args;
  const trimmedName = (name ?? "").trim();
  const trimmedUrl = (url ?? "").trim();

  if (!trimmedName && !trimmedUrl) {
    return {
      id, label,
      status: required ? "error" : "empty",
      message: required ? "Required: add a tool name and Amazon URL." : "Not set (optional).",
    };
  }
  if (trimmedName && !trimmedUrl) {
    return { id, label, status: "error", message: `"${trimmedName}" has no Amazon URL.` };
  }
  if (!trimmedName && trimmedUrl) {
    return { id, label, status: "error", message: "URL is set but tool name is missing." };
  }

  let parsed: URL;
  try { parsed = new URL(trimmedUrl); }
  catch { return { id, label, status: "error", message: "Not a valid URL (must start with https://)." }; }
  if (parsed.protocol !== "https:") {
    return { id, label, status: "error", message: "URL must use https://." };
  }

  const host = parsed.hostname.toLowerCase();
  if (SHORTENER_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
    return { id, label, status: "error", message: `Shorteners (${host}) are not allowed — use the full Amazon URL.` };
  }
  const isAmazon = AMAZON_HOSTS.includes(host) || host.endsWith(".amazon.com");
  if (!isAmazon) {
    return { id, label, status: "error", message: `Host "${host}" is not an Amazon domain.` };
  }
  if (host === "amzn.to") {
    return { id, label, status: "warning", message: "amzn.to short link works but a full /dp/ URL is preferred for transparency." };
  }
  const asinMatch = parsed.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (!asinMatch) {
    return { id, label, status: "error", message: "Amazon URL must contain /dp/ASIN or /gp/product/ASIN (10-char product ID)." };
  }
  return { id, label, status: "ok", message: `Valid Amazon link · ASIN ${asinMatch[1].toUpperCase()}` };
}

export function validateEntryLinks(entry: CookingLabEntryInput): LinkCheck[] {
  return TOOL_SLOTS.map((slot) =>
    validateAmazonLink({
      id: slot.id, label: slot.label,
      name: (entry[slot.nameKey] as string | null) ?? null,
      url: (entry[slot.urlKey] as string | null) ?? null,
      required: slot.required,
    }),
  );
}

export function computeToolFieldErrors(entry: CookingLabEntryInput): ToolFieldErrors {
  const errors: ToolFieldErrors = {};
  for (const slot of TOOL_SLOTS) {
    const name = (((entry[slot.nameKey] as string | null) ?? "") as string).trim();
    const url  = (((entry[slot.urlKey]  as string | null) ?? "") as string).trim();

    if (slot.required) {
      if (!name) errors[slot.nameKey] = "Required — add the tool name shown to readers.";
      if (!url)  errors[slot.urlKey]  = "Required — paste the full Amazon product URL.";
      else {
        const c = validateAmazonLink({ id: slot.id, label: slot.label, name: name || "x", url, required: true });
        if (c.status === "error") errors[slot.urlKey] = c.message;
      }
    } else {
      if (name && !url) errors[slot.urlKey]  = "Required — name is set, add the Amazon URL too.";
      if (!name && url) errors[slot.nameKey] = "Required — URL is set, add the tool name too.";
      if (url) {
        const c = validateAmazonLink({ id: slot.id, label: slot.label, name: name || "x", url, required: false });
        if (c.status === "error") errors[slot.urlKey] = c.message;
      }
    }
  }
  return errors;
}

/**
 * Authoritative publish-readiness check. Returns null if OK, or a structured
 * failure describing every blocking reason. Used by the server function on
 * save — if status === "published" and this returns non-null, the save is
 * rejected. Client UI uses the same data to gate the publish button.
 */
export type PublishValidationFailure = {
  reason: string;
  qaIncomplete: boolean;
  failingChecks: LinkCheck[];
  fieldErrors: ToolFieldErrors;
};

export function validateCookingLabEntryForPublish(
  entry: CookingLabEntryInput,
): PublishValidationFailure | null {
  const qaItems = [
    entry.qa_copy_reviewed,
    entry.qa_video_loads,
    entry.qa_image_loads,
    entry.qa_links_tested,
    entry.qa_ready,
  ];
  const qaIncomplete = qaItems.some((v) => !v);

  const checks = validateEntryLinks(entry);
  const failingChecks = checks.filter((c) => c.status === "error");
  const fieldErrors = computeToolFieldErrors(entry);
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  if (!qaIncomplete && failingChecks.length === 0 && !hasFieldErrors) return null;

  const parts: string[] = [];
  if (qaIncomplete) parts.push("Complete all 5 QA checklist items before publishing.");
  if (failingChecks.length > 0) {
    parts.push(`Link validation failed: ${failingChecks.map((c) => `${c.label} — ${c.message}`).join("; ")}`);
  } else if (hasFieldErrors) {
    parts.push("Fix all required tool fields before publishing.");
  }

  return {
    reason: parts.join(" "),
    qaIncomplete,
    failingChecks,
    fieldErrors,
  };
}
