import { supabase } from "@/integrations/supabase/client";

const EXPORTS_BUCKET = "site-assets";

export type SavedExportFile = {
  filename: string;
  path: string;
  url: string;
};

export async function saveExportFile(
  content: string | Blob,
  filename: string,
  mime: string,
): Promise<SavedExportFile> {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `exports/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await supabase.storage.from(EXPORTS_BUCKET).upload(path, blob, {
    contentType: blob.type || mime || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(EXPORTS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("No file URL returned after saving.");
  }

  return {
    filename: safeFilename,
    path,
    url: data.publicUrl,
  };
}