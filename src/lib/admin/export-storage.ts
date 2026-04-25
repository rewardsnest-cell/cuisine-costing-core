import { supabase } from "@/integrations/supabase/client";

const EXPORTS_BUCKET = "site-assets";

export type SavedExportFile = {
  filename: string;
  path: string;
  url: string;
};

export type StoragePreflight = {
  ok: boolean;
  bucketExists: boolean;
  isPublic: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  error?: string;
};

let _preflightCache: { result: StoragePreflight; ts: number } | null = null;
const PREFLIGHT_TTL_MS = 60_000;

/**
 * Verify the storage bucket exists, is public, and the current user can write to it.
 * Cached for 60s to avoid repeated round-trips.
 */
export async function checkExportStorage(force = false): Promise<StoragePreflight> {
  if (!force && _preflightCache && Date.now() - _preflightCache.ts < PREFLIGHT_TTL_MS) {
    return _preflightCache.result;
  }

  const result: StoragePreflight = {
    ok: false,
    bucketExists: false,
    isPublic: false,
    authenticated: false,
    isAdmin: false,
  };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;
    result.authenticated = !!userId;

    if (!userId) {
      result.error = "You must be signed in to save exports.";
      _preflightCache = { result, ts: Date.now() };
      return result;
    }

    // Check admin role (required by INSERT policy on storage.objects)
    const { data: roleRow } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    result.isAdmin = !!roleRow;

    if (!result.isAdmin) {
      result.error = "Admin role required to upload exports.";
      _preflightCache = { result, ts: Date.now() };
      return result;
    }

    // Verify bucket via getPublicUrl (no extra permissions needed)
    const probePath = `_preflight/${userId}.txt`;
    const { data: pub } = supabase.storage.from(EXPORTS_BUCKET).getPublicUrl(probePath);
    if (pub?.publicUrl) {
      result.bucketExists = true;
      result.isPublic = true;
    } else {
      result.error = `Storage bucket "${EXPORTS_BUCKET}" is not configured.`;
      _preflightCache = { result, ts: Date.now() };
      return result;
    }

    result.ok = true;
    _preflightCache = { result, ts: Date.now() };
    return result;
  } catch (e: any) {
    result.error = e?.message || "Storage preflight failed.";
    _preflightCache = { result, ts: Date.now() };
    return result;
  }
}

export async function saveExportFile(
  content: string | Blob,
  filename: string,
  mime: string,
): Promise<SavedExportFile> {
  // Preflight: surface a clear error before attempting the upload
  const pre = await checkExportStorage();
  if (!pre.ok) {
    throw new Error(
      pre.error ||
        "Storage is not ready. Confirm you're signed in as an admin and the site-assets bucket exists.",
    );
  }

  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `exports/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await supabase.storage.from(EXPORTS_BUCKET).upload(path, blob, {
    contentType: blob.type || mime || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    // Translate common Supabase storage errors into actionable guidance
    const msg = uploadError.message || "";
    if (/row-level security|not authorized|permission/i.test(msg)) {
      // Bust cache so next call re-checks
      _preflightCache = null;
      throw new Error(
        "Storage permission denied. You need an admin role to save exports. " +
          `(Original: ${msg})`,
      );
    }
    if (/bucket.*not.*found/i.test(msg)) {
      _preflightCache = null;
      throw new Error(
        `Storage bucket "${EXPORTS_BUCKET}" not found. Ask an admin to create it.`,
      );
    }
    throw uploadError;
  }

  const { data } = supabase.storage.from(EXPORTS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Upload succeeded but no public URL was returned.");
  }

  // Best-effort: also log this in user_downloads so it appears in the
  // unified Downloads hub for both the user and admins.
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;
    if (userId) {
      await (supabase as any).from("user_downloads").insert({
        user_id: userId,
        kind: "admin_export",
        filename: safeFilename,
        storage_path: path,
        public_url: data.publicUrl,
        mime_type: blob.type || mime || "application/octet-stream",
        size_bytes: blob.size,
        source_label: filename,
      });
    }
  } catch { /* non-fatal */ }

  return {
    filename: safeFilename,
    path,
    url: data.publicUrl,
  };
}
