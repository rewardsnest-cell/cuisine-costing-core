import { supabase } from "@/integrations/supabase/client";

const BUCKET = "site-assets";

export type DownloadKind =
  | "recipe_card"
  | "quote_pdf"
  | "newsletter_guide"
  | "shopping_list"
  | "audit_export"
  | "admin_export"
  | "other";

export type SaveAndLogInput = {
  blob: Blob;
  filename: string;
  kind: DownloadKind;
  sourceId?: string | null;
  sourceLabel?: string | null;
  /** Trigger the local browser download too. Default true. */
  triggerLocalDownload?: boolean;
};

export type SaveAndLogResult = {
  loggedDownloadId: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  /** True when we successfully uploaded + logged. False = local-only fallback. */
  persisted: boolean;
};

function browserDownload(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Mobile fallback: open the persisted public URL in a new tab. */
export function openPublicUrl(url: string) {
  if (typeof window === "undefined" || !url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

/**
 * Save a generated file to backend storage AND log the download against the
 * current user. Always triggers the local browser download as well so the
 * user's existing UX is preserved. Falls back to local-only when anonymous
 * or when upload/log fails — never throws.
 */
export async function saveAndLogDownload(
  input: SaveAndLogInput,
): Promise<SaveAndLogResult> {
  const {
    blob,
    filename,
    kind,
    sourceId = null,
    sourceLabel = null,
    triggerLocalDownload = true,
  } = input;

  const result: SaveAndLogResult = {
    loggedDownloadId: null,
    storagePath: null,
    publicUrl: null,
    persisted: false,
  };

  // Always give the user the file first so a backend hiccup never blocks them.
  if (triggerLocalDownload) {
    try { browserDownload(blob, filename); } catch { /* ignore */ }
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;
    if (!userId) return result; // anonymous: local-only

    const safe = safeName(filename);
    const day = new Date().toISOString().slice(0, 10);
    const path = `downloads/${userId}/${day}/${Date.now()}-${safe}`;
    const mime = blob.type || "application/octet-stream";

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: mime, upsert: false });
    if (upErr) return result;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl ?? null;

    const { data: row, error: insErr } = await (supabase as any)
      .from("user_downloads")
      .insert({
        user_id: userId,
        kind,
        filename: safe,
        storage_path: path,
        public_url: publicUrl,
        mime_type: mime,
        size_bytes: blob.size,
        source_id: sourceId,
        source_label: sourceLabel,
      })
      .select("id")
      .single();
    if (insErr) return result;

    result.loggedDownloadId = row?.id ?? null;
    result.storagePath = path;
    result.publicUrl = publicUrl;
    result.persisted = true;
    return result;
  } catch {
    return result;
  }
}
