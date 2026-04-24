import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    meta: [
      { title: "Cooking Guides — VPS Finest" },
      {
        name: "description",
        content:
          "Educational cooking guides covering techniques, tools, and ingredient know-how. Calm, practical reading for home cooks.",
      },
      { property: "og:title", content: "Cooking Guides — VPS Finest" },
      {
        property: "og:description",
        content:
          "Techniques, tools, and ingredient know-how — practical reading for home cooks.",
      },
    ],
  }),
  component: GuidesIndex,
});

type GuideRow = {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
  published_at: string | null;
};

function GuidesIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-cooking-guides"],
    queryFn: async (): Promise<GuideRow[]> => {
      const { data, error } = await supabase
        .from("cooking_guides")
        .select("id, slug, title, updated_at, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GuideRow[];
    },
  });

  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span>Cooking Guides</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-foreground tracking-tight">
            Learn the craft, one technique at a time.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
            Plain-spoken guides on tools, techniques, and ingredients —
            written to help home cooks build real confidence in the kitchen.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading guides…</p>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card p-8 text-center">
            <p className="text-foreground font-medium">No guides published yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check back soon — we're writing the first batch now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.map((g) => (
              <li key={g.id} className="py-6">
                <Link
                  to="/guides/$slug"
                  params={{ slug: g.slug }}
                  className="group block"
                >
                  <h2 className="font-display text-2xl text-foreground group-hover:text-primary transition-colors">
                    {g.title}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated{" "}
                    {new Date(g.updated_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
