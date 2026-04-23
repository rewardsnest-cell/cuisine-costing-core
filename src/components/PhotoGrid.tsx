import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Instagram } from "lucide-react";
import { recordAssetEvent } from "@/lib/asset-debug";

interface Tile {
  url: string;
  alt: string;
  href?: string;
}

interface Props {
  /** Heading text. Defaults to "From our kitchen". */
  heading?: string;
  /** Subhead under the heading. */
  subhead?: string;
  /** Max tiles. Default 9. */
  limit?: number;
  /** Show the Instagram CTA below the grid. Default true. */
  showInstagram?: boolean;
  className?: string;
}

const INSTAGRAM_URL = "https://instagram.com/vpsfinest";

/**
 * Instagram-style photo grid.
 * Pulls site_asset_manifest rows with slug starting with "gallery-" first,
 * then fills with the most recent recipe photos.
 */
export function PhotoGrid({
  heading = "From our kitchen",
  subhead = "A small look at what we've been cooking and serving lately.",
  limit = 9,
  showInstagram = true,
  className = "",
}: Props) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const collected: Tile[] = [];

      // 1) gallery- prefixed manifest entries
      const { data: gallery, error: galleryErr } = await (supabase as any)
        .from("site_asset_manifest")
        .select("slug, public_url")
        .like("slug", "gallery-%")
        .order("slug")
        .limit(limit);
      if (galleryErr) {
        recordAssetEvent({ slug: "gallery-*", status: "error", error: galleryErr.message });
      } else if (!gallery || gallery.length === 0) {
        recordAssetEvent({ slug: "gallery-*", status: "missing", error: "No gallery-* slugs in site_asset_manifest" });
      }
      for (const g of gallery || []) {
        if (g?.public_url) {
          collected.push({ url: g.public_url, alt: g.slug || "Gallery image" });
          recordAssetEvent({ slug: g.slug, status: "ok", url: g.public_url });
        }
      }

      // 2) Top up with recent recipes that have an image
      if (collected.length < limit) {
        const remaining = limit - collected.length;
        const { data: recipes, error: recipesErr } = await (supabase as any)
          .from("recipes")
          .select("id, name, image_url")
          .eq("active", true)
          .not("image_url", "is", null)
          .order("updated_at", { ascending: false })
          .limit(remaining * 2); // fetch a few extra in case of dedupe
        if (recipesErr) {
          recordAssetEvent({ slug: "recipes(image_url)", status: "error", error: recipesErr.message });
        }
        const seen = new Set(collected.map((t) => t.url));
        for (const r of recipes || []) {
          if (collected.length >= limit) break;
          if (!r.image_url || seen.has(r.image_url)) continue;
          collected.push({ url: r.image_url, alt: r.name || "Recipe", href: `/recipes/${r.id}` });
          seen.add(r.image_url);
        }
      }

      setTiles(collected.slice(0, limit));
      setLoading(false);
    })();
  }, [limit]);

  if (!loading && tiles.length === 0) return null;

  return (
    <section className={`py-20 bg-background ${className}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">@vpsfinest</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">{heading}</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">{subhead}</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-1.5 sm:gap-2">
          {(loading ? Array.from({ length: limit }) : tiles).map((t, i) => {
            const tile = t as Tile | undefined;
            const inner = (
              <div className="relative aspect-square overflow-hidden bg-muted group">
                {tile?.url ? (
                  <img
                    src={tile.url}
                    alt={tile.alt}
                    loading="lazy"
                    decoding="async"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-muted via-muted/80 to-muted/60 animate-pulse" />
                )}
              </div>
            );
            return (
              <div key={i}>
                {tile?.href ? (
                  <Link to={tile.href as any}>{inner}</Link>
                ) : tile?.url ? (
                  <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">{inner}</a>
                ) : (
                  inner
                )}
              </div>
            );
          })}
        </div>
        {showInstagram && (
          <div className="text-center mt-8">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-accent hover:underline"
            >
              <Instagram className="w-4 h-4" />
              Follow @vpsfinest on Instagram
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
