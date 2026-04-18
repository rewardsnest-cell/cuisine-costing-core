import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE = "https://www.vpsfinest.com";
const STATIC = ["/", "/catering", "/weddings", "/recipes", "/about", "/contact", "/catering/quote"];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let recipeUrls: string[] = [];
        try {
          const { data } = await supabaseAdmin
            .from("recipes")
            .select("id, name, updated_at, image_url")
            .eq("active", true);
          recipeUrls = (data || []).map((r: any) => {
            const lastmod = new Date(r.updated_at).toISOString();
            const loc = `${SITE}/recipes/${r.id}`;
            const imageBlock = r.image_url
              ? `<image:image><image:loc>${escapeXml(r.image_url)}</image:loc><image:title>${escapeXml(r.name || "")}</image:title></image:image>`
              : "";
            return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod>${imageBlock}</url>`;
          });
        } catch {}
        const staticUrls = STATIC.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${staticUrls}\n${recipeUrls.join("\n")}\n</urlset>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml" } });
      },
    },
  },
});
