import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CookingLabPageBody, type CookingLabEntry } from "@/routes/cooking-lab";
import { ChevronLeft, FlaskConical } from "lucide-react";

type Collection = {
  id: string;
  slug: string;
  name: string;
  description: string;
  hero_image_url: string | null;
};

export const Route = createFileRoute("/cooking-lab/c/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await (supabase as any)
      .from("cooking_lab_collections")
      .select("id,slug,name,description,hero_image_url")
      .eq("slug", params.slug)
      .eq("visible", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { collection: data as Collection };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.collection;
    const title = c ? `${c.name} — Cooking Lab | VPS Finest` : "Cooking Lab Collection";
    const desc = c?.description || "Curated Cooking Lab techniques.";
    const url = c ? `https://www.vpsfinest.com/cooking-lab/c/${c.slug}` : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        ...(c?.hero_image_url ? [{ property: "og:image", content: c.hero_image_url }] : []),
        ...(c?.hero_image_url ? [{ name: "twitter:image", content: c.hero_image_url }] : []),
        ...(url ? ([{ rel: "canonical", href: url }] as any) : []),
      ],
    };
  },
  notFoundComponent: () => (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <FlaskConical className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
      <h1 className="font-display text-3xl font-bold">Collection not found</h1>
      <p className="mt-2 text-muted-foreground">
        This Cooking Lab collection doesn't exist or isn't published yet.
      </p>
      <Link
        to="/cooking-lab"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Cooking Lab
      </Link>
    </div>
  ),
  component: CollectionPage,
});

function CollectionPage() {
  const { collection } = Route.useLoaderData();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["cooking-lab", "collection", collection.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_entry_collections")
        .select(
          `position, entry:cooking_lab_entries!inner(
            id,title,description,video_url,image_url,
            primary_tool_name,primary_tool_url,
            secondary_tool_name,secondary_tool_url,
            display_order,visible,status
          )`,
        )
        .eq("collection_id", collection.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((row) => row.entry as CookingLabEntry & { visible: boolean; status: string })
        .filter((e) => e && e.visible && e.status === "published") as CookingLabEntry[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div>
      <div className="border-b border-border bg-muted/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            to="/cooking-lab"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" /> All Cooking Lab
          </Link>
        </div>
      </div>
      <section className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            Collection
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            {collection.name}
          </h1>
          {collection.description && (
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              {collection.description}
            </p>
          )}
        </div>
      </section>
      <CookingLabPageBody entries={entries ?? null} isLoading={isLoading} />
    </div>
  );
}
