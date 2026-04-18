import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ImportAssetInput = {
  url: string;
  alt: string | null;
  category: string;
  slug: string;
};

export type ImportResult = {
  imported: number;
  failed: number;
  errors: { slug: string; error: string }[];
  assets: { slug: string; public_url: string; category: string }[];
};

function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  return "jpg";
}

export const importSiteAssets = createServerFn({ method: "POST" })
  .inputValidator((d: { items: ImportAssetInput[] }) => d)
  .handler(async ({ data }): Promise<ImportResult> => {
    const errors: { slug: string; error: string }[] = [];
    const assets: { slug: string; public_url: string; category: string }[] = [];
    let imported = 0;
    let failed = 0;

    for (const item of data.items) {
      try {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const ct = res.headers.get("content-type");
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = extFromContentType(ct);
        const path = `${item.category}/${item.slug}.${ext}`;

        const up = await supabaseAdmin.storage
          .from("site-assets")
          .upload(path, buf, { contentType: ct || "image/jpeg", upsert: true });
        if (up.error) throw up.error;

        const { data: pub } = supabaseAdmin.storage.from("site-assets").getPublicUrl(path);

        const { error: dbErr } = await supabaseAdmin
          .from("site_asset_manifest")
          .upsert(
            {
              slug: item.slug,
              category: item.category,
              source_url: item.url,
              storage_path: path,
              public_url: pub.publicUrl,
              alt: item.alt,
              bytes: buf.byteLength,
              content_type: ct,
            },
            { onConflict: "slug" }
          );
        if (dbErr) throw dbErr;

        imported++;
        assets.push({ slug: item.slug, public_url: pub.publicUrl, category: item.category });
      } catch (e: any) {
        failed++;
        errors.push({ slug: item.slug, error: e?.message || String(e) });
      }
    }

    return { imported, failed, errors, assets };
  });

export const listSiteAssets = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("site_asset_manifest")
    .select("slug, category, public_url, alt, source_url, bytes, content_type, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return { assets: data || [] };
});
