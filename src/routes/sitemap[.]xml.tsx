import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE = "https://www.vpsfinest.com";

/**
 * Static URL groups, keyed by feature_visibility.feature_key.
 * Routes whose feature is not 'public' OR has seo_indexing_enabled=false
 * are excluded from the sitemap entirely.
 *
 * Always-on routes (home, about, contact) live under the "_always" key.
 */
const STATIC_GROUPS: Record<string, string[]> = {
  _always: ["/", "/about", "/contact"],
  catering: ["/catering"],
  menu: ["/menu"],
  weddings: [
    "/weddings",
    "/weddings/booking-timeline",
    "/weddings/spring-aurora-ohio",
    "/weddings/fall-hudson-ohio",
    "/weddings/winter-cleveland-ohio",
  ],
  recipes: ["/recipes"],
  blog: [
    "/blog",
    "/blog/spring-wedding-catering-guide",
    "/blog/fall-wedding-catering-guide",
    "/blog/winter-wedding-catering-guide",
  ],
  guides: ["/guides"],
  familiar_favorites: ["/familiar-favorites"],
  quote: ["/catering/quote"],
};

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
        // Pull visibility registry; default to "indexable" if a row is missing.
        const visibility = new Map<string, { phase: string; seo: boolean }>();
        try {
          const { data } = await (supabaseAdmin as any)
            .from("feature_visibility")
            .select("feature_key, phase, seo_indexing_enabled");
          for (const r of (data ?? []) as any[]) {
            visibility.set(r.feature_key, { phase: r.phase, seo: !!r.seo_indexing_enabled });
          }
        } catch {
          // If the registry fails to load, fall back to indexing everything.
        }

        const isIndexable = (key: string) => {
          if (key === "_always") return true;
          const row = visibility.get(key);
          if (!row) return true;
          return row.phase === "public" && row.seo;
        };

        const staticUrls: string[] = [];
        for (const [key, paths] of Object.entries(STATIC_GROUPS)) {
          if (!isIndexable(key)) continue;
          for (const p of paths) staticUrls.push(`<url><loc>${SITE}${p}</loc></url>`);
        }

        let recipeUrls: string[] = [];
        if (isIndexable("recipes")) {
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
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${staticUrls.join("\n")}\n${recipeUrls.join("\n")}\n</urlset>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml" } });
      },
    },
  },
});
