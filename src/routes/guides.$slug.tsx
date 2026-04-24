import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BookOpen, Wrench, Sprout } from "lucide-react";

export const Route = createFileRoute("/guides/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Guide: ${params.slug.replace(/-/g, " ")} — VPS Finest` },
      {
        name: "description",
        content:
          "An educational cooking guide from VPS Finest — techniques, tools, and ingredient know-how for home cooks.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  component: GuideDetail,
});

type GuideDetailRow = {
  id: string;
  slug: string;
  title: string;
  body: string;
  updated_at: string;
  published_at: string | null;
  related_ingredients: unknown;
  related_tools: unknown;
};

type RelatedItem = { name?: string; note?: string; url?: string };

function asItems(value: unknown): RelatedItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v): RelatedItem | null => {
      if (typeof v === "string") return { name: v };
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name : undefined;
        if (!name) return null;
        return {
          name,
          note: typeof o.note === "string" ? o.note : undefined,
          url: typeof o.url === "string" ? o.url : undefined,
        };
      }
      return null;
    })
    .filter((x): x is RelatedItem => x !== null);
}

function GuideDetail() {
  const { slug } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-cooking-guide", slug],
    queryFn: async (): Promise<GuideDetailRow | null> => {
      const { data, error } = await supabase
        .from("cooking_guides")
        .select(
          "id, slug, title, body, updated_at, published_at, related_ingredients, related_tools",
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return (data as GuideDetailRow | null) ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    throw notFound();
  }

  const tools = asItems(data.related_tools);
  const ingredients = asItems(data.related_ingredients);
  const hasAffiliateLink = [...tools, ...ingredients].some((i) => i.url);

  return (
    <article className="bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <Link
          to="/guides"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All guides
        </Link>

        <header className="mt-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cooking Guide</span>
          </div>
          <h1 className="mt-3 font-display text-4xl md:text-5xl font-semibold text-foreground tracking-tight">
            {data.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated{" "}
            {new Date(data.updated_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </header>

        <div className="prose prose-neutral dark:prose-invert max-w-none mt-8 whitespace-pre-wrap text-foreground leading-relaxed">
          {data.body}
        </div>

        {(tools.length > 0 || ingredients.length > 0) && (
          <aside className="mt-12 rounded-lg border border-border/60 bg-muted/20 p-6">
            <h2 className="font-display text-xl text-foreground">References</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Conceptual references only — no quantities, no recipes attached.
            </p>

            {tools.length > 0 && (
              <section className="mt-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Wrench className="h-4 w-4" aria-hidden="true" /> Tools & equipment
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {tools.map((t, i) => (
                    <li key={i}>
                      {t.url ? (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer sponsored nofollow"
                          className="text-primary hover:underline"
                        >
                          {t.name}
                        </a>
                      ) : (
                        <span className="text-foreground">{t.name}</span>
                      )}
                      {t.note && <span> — {t.note}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ingredients.length > 0 && (
              <section className="mt-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sprout className="h-4 w-4" aria-hidden="true" /> Ingredients to know
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {ingredients.map((t, i) => (
                    <li key={i}>
                      {t.url ? (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer sponsored nofollow"
                          className="text-primary hover:underline"
                        >
                          {t.name}
                        </a>
                      ) : (
                        <span className="text-foreground">{t.name}</span>
                      )}
                      {t.note && <span> — {t.note}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasAffiliateLink && (
              <p className="mt-5 text-xs text-muted-foreground border-t border-border/60 pt-4">
                Some links may earn us a small commission at no extra cost to you.
                We only reference tools and ingredients we'd actually use.
              </p>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}
