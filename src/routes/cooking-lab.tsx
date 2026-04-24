import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { youtubeEmbedUrl } from "@/lib/recipe-video";
import { withAmazonAffiliateTag } from "@/lib/amazon-affiliate";
import { FlaskConical, ExternalLink, Play, Layers, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type CookingLabCollection = {
  id: string;
  slug: string;
  name: string;
  description: string;
  hero_image_url: string | null;
};

function useAmazonAssociateTag() {
  return useQuery({
    queryKey: ["amazon-associate-tag"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_kv")
        .select("value")
        .eq("key", "amazon_associate_tag")
        .maybeSingle();
      return ((data?.value as string | null) ?? "").trim() || null;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export type CookingLabEntry = {
  id: string;
  title: string;
  description: string;
  video_url: string | null;
  image_url: string | null;
  primary_tool_name: string | null;
  primary_tool_url: string | null;
  secondary_tool_name: string | null;
  secondary_tool_url: string | null;
  display_order: number;
};

export const Route = createFileRoute("/cooking-lab")({
  head: () => ({
    meta: [
      { title: "Cooking Lab — Techniques, Science & Tools | VPS Finest" },
      {
        name: "description",
        content:
          "Fun cooking techniques, simple food science, and the tools we actually use. Curated by VPS Finest.",
      },
      { property: "og:title", content: "Cooking Lab — VPS Finest" },
      {
        property: "og:description",
        content:
          "Fun cooking techniques, simple food science, and the tools we actually use.",
      },
      { name: "twitter:title", content: "Cooking Lab — VPS Finest" },
      {
        name: "twitter:description",
        content:
          "Fun cooking techniques, simple food science, and the tools we actually use.",
      },
      { property: "og:type", content: "website" },
      { rel: "canonical", href: "https://www.vpsfinest.com/cooking-lab" } as any,
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Cooking Lab",
          description:
            "Fun cooking techniques, simple food science, and the tools we actually use.",
          url: "https://www.vpsfinest.com/cooking-lab",
          isPartOf: { "@type": "WebSite", name: "VPS Finest", url: "https://www.vpsfinest.com" },
        }),
      },
    ],
  }),
  component: CookingLabPage,
});

function CookingLabPage() {
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["cooking-lab", "public"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_entries")
        .select(
          "id,title,description,video_url,image_url,primary_tool_name,primary_tool_url,secondary_tool_name,secondary_tool_url,display_order",
        )
        .eq("visible", true)
        .eq("status", "published")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CookingLabEntry[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: collections } = useQuery({
    queryKey: ["cooking-lab", "collections", "public"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_collections")
        .select("id,slug,name,description,hero_image_url")
        .eq("visible", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CookingLabCollection[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: entryCollectionMap } = useQuery({
    queryKey: ["cooking-lab", "entry-collections", "public"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_entry_collections")
        .select("entry_id,collection_id");
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const row of (data ?? []) as { entry_id: string; collection_id: string }[]) {
        if (!map.has(row.entry_id)) map.set(row.entry_id, new Set());
        map.get(row.entry_id)!.add(row.collection_id);
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });

  const filteredEntries = useMemo(() => {
    if (!entries) return null;
    let result = entries;
    if (activeCollectionId) {
      const map = entryCollectionMap;
      result = result.filter((e) => map?.get(e.id)?.has(activeCollectionId));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((e) => {
        const haystack = [
          e.title,
          e.description,
          e.primary_tool_name ?? "",
          e.secondary_tool_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [entries, activeCollectionId, entryCollectionMap, searchQuery]);

  return (
    <CookingLabPageBody
      entries={filteredEntries}
      isLoading={isLoading}
      collections={collections ?? null}
      activeCollectionId={activeCollectionId}
      onSelectCollection={setActiveCollectionId}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      totalEntryCount={entries?.length ?? 0}
    />
  );
}

/**
 * Pure presentational body for the public Cooking Lab page.
 * Exposed so the admin "Preview full page" can render an exact replica
 * with arbitrary entry sets (published-only or include-drafts) without
 * duplicating layout, hero, intro, gear anchor, or affiliate disclosure.
 */
export function CookingLabPageBody({
  entries,
  isLoading,
  collections,
  activeCollectionId,
  onSelectCollection,
  searchQuery,
  onSearchQueryChange,
  totalEntryCount,
}: {
  entries: CookingLabEntry[] | null;
  isLoading: boolean;
  collections?: CookingLabCollection[] | null;
  activeCollectionId?: string | null;
  onSelectCollection?: (id: string | null) => void;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  totalEntryCount?: number;
}) {
  const showCollectionsUi = !!collections && collections.length > 0;
  const showSearch = !!onSearchQueryChange;
  const trimmedQuery = (searchQuery ?? "").trim();
  const hasActiveFilters = !!activeCollectionId || trimmedQuery.length > 0;
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" aria-hidden />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <FlaskConical className="w-3.5 h-3.5" />
            From the VPS Finest kitchen
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold text-foreground tracking-tight">
            Cooking Lab
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Fun cooking techniques, simple food science, and tools we actually use.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#videos"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Play className="w-4 h-4" />
              Watch the Videos
            </a>
            {showCollectionsUi && (
              <a
                href="#collections"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Layers className="w-4 h-4" />
                Browse Collections
              </a>
            )}
            <a
              href="#gear"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Get the Gear
            </a>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none text-muted-foreground">
          <p className="text-lg leading-relaxed">
            Cooking Lab is about <strong className="text-foreground">techniques, not recipes</strong>.
            We focus on the small moves that turn good food into great food — repeatable
            results, predictable wins, and a few tools that punch above their weight.
          </p>
          <p className="text-base leading-relaxed mt-4">
            Built for curious cooks who like to know <em>why</em> something works, then do
            it again next weekend without thinking twice.
          </p>
        </div>
      </section>

      {/* Collections */}
      {showCollectionsUi && (
        <section id="collections" className="border-y border-border bg-muted/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                  Browse Collections
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Curated sets of techniques grouped by goal.
                </p>
              </div>
              {onSelectCollection && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectCollection(null)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      !activeCollectionId
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    All
                  </button>
                  {collections!.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectCollection(c.id)}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        activeCollectionId === c.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections!.map((c) => (
                <Link
                  key={c.id}
                  to="/cooking-lab/c/$slug"
                  params={{ slug: c.slug }}
                  className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                    <Layers className="w-3.5 h-3.5" /> Collection
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                    {c.name}
                  </h3>
                  {c.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                      {c.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Sections */}
      <section id="videos" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading techniques…</div>
        ) : !entries || entries.length === 0 ? (
          <div className="text-center py-20">
            <FlaskConical className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold text-foreground">
              {activeCollectionId ? "No techniques in this collection yet" : "New techniques coming soon"}
            </h2>
            <p className="mt-2 text-muted-foreground max-w-md mx-auto">
              {activeCollectionId
                ? "Try another collection or view all techniques."
                : "We're prepping the first round of Cooking Lab videos. Check back shortly."}
            </p>
          </div>
        ) : (
          entries.map((entry, idx) => (
            <CookingLabSection key={entry.id} entry={entry} reverse={idx % 2 === 1} />
          ))
        )}
      </section>

      {/* Gear anchor for Get the Gear button when no entries */}
      <div id="gear" aria-hidden />

      {/* Affiliate disclosure */}
      <section className="border-t border-border bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            As an Amazon Associate, VPSFinest earns from qualifying purchases.
          </p>
        </div>
      </section>
    </div>
  );
}

export function CookingLabSection({
  entry,
  reverse,
  associateTagOverride,
}: {
  entry: CookingLabEntry;
  reverse: boolean;
  /** Optional override for previewing in the admin. Falls back to live config. */
  associateTagOverride?: string | null;
}) {
  const embedUrl = youtubeEmbedUrl(entry.video_url);
  const tagQuery = useAmazonAssociateTag();
  const tag = associateTagOverride !== undefined ? associateTagOverride : tagQuery.data;
  const primaryHref = withAmazonAffiliateTag(entry.primary_tool_url, tag);
  const secondaryHref = withAmazonAffiliateTag(entry.secondary_tool_url, tag);
  const hasTools =
    (entry.primary_tool_name && entry.primary_tool_url) ||
    (entry.secondary_tool_name && entry.secondary_tool_url);

  return (
    <article className="grid lg:grid-cols-2 gap-10 items-center">
      <div className={reverse ? "lg:order-2" : ""}>
        {embedUrl ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg bg-muted">
            <iframe
              src={embedUrl}
              title={entry.title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        ) : entry.image_url ? (
          <img
            src={entry.image_url}
            alt={entry.title}
            loading="lazy"
            className="w-full aspect-video object-cover rounded-xl shadow-lg"
          />
        ) : (
          <div className="w-full aspect-video rounded-xl bg-gradient-to-br from-muted to-muted/50 grid place-items-center">
            <FlaskConical className="w-12 h-12 text-muted-foreground/40" />
          </div>
        )}
        {entry.image_url && embedUrl && (
          <img
            src={entry.image_url}
            alt=""
            loading="lazy"
            className="mt-3 w-full h-32 object-cover rounded-md opacity-90"
          />
        )}
      </div>

      <div className={reverse ? "lg:order-1" : ""}>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
          {entry.title}
        </h2>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{entry.description}</p>

        {hasTools && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Tools We Used
            </h3>
            <ul className="space-y-2">
              {entry.primary_tool_name && entry.primary_tool_url && (
                <li>
                  <a
                    href={primaryHref}
                    target="_blank"
                    rel="nofollow noopener sponsored"
                    data-affiliate-network="amazon"
                    data-affiliate-slot="cooking-lab-primary"
                    data-affiliate-entry-id={entry.id}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    {entry.primary_tool_name}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
              )}
              {entry.secondary_tool_name && entry.secondary_tool_url && (
                <li>
                  <a
                    href={secondaryHref}
                    target="_blank"
                    rel="nofollow noopener sponsored"
                    data-affiliate-network="amazon"
                    data-affiliate-slot="cooking-lab-secondary"
                    data-affiliate-entry-id={entry.id}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    {entry.secondary_tool_name}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
