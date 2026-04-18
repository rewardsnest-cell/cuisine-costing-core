import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE = "https://www.vpsfinest.com";
const STATIC = ["/", "/catering", "/weddings", "/recipes", "/about", "/contact", "/catering/quote"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let recipeUrls: string[] = [];
        try {
          const { data } = await supabaseAdmin
            .from("recipes")
            .select("id, updated_at")
            .eq("active", true);
          recipeUrls = (data || []).map(
            (r: any) => `<url><loc>${SITE}/recipes/${r.id}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod></url>`
          );
        } catch {}
        const staticUrls = STATIC.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${recipeUrls.join("\n")}\n</urlset>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml" } });
      },
    },
  },
});
