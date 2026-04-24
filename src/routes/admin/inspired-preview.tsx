import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { PHASE_BADGE_CLASS, PHASE_LABEL, type InspiredPhase } from "@/lib/inspired";

export const Route = createFileRoute("/admin/inspired-preview")({
  head: () => ({ meta: [{ title: "Familiar Favorites Preview — Admin" }] }),
  component: FamiliarFavoritesPreview,
});

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  hook: string | null;
  image_url: string | null;
  category: string | null;
  cuisine: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  inspired_phase: InspiredPhase;
  status: string | null;
  active: boolean;
};

function FamiliarFavoritesPreview() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<"all" | InspiredPhase>("all");

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("recipes")
        .select("id, name, description, hook, image_url, category, cuisine, prep_time, cook_time, servings, inspired_phase, status, active")
        .eq("inspired", true)
        .order("name");
      setRecipes((data || []) as Recipe[]);
      setLoading(false);
    })();
  }, []);

  const filtered = phaseFilter === "all" ? recipes : recipes.filter((r) => r.inspired_phase === phaseFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Banner */}
      <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-300">
            ADMIN PREVIEW — NOT PUBLIC
          </p>
          <p className="text-muted-foreground mt-0.5">
            This page shows every recipe flagged as a Familiar Favorite regardless of phase. Public visitors only see recipes whose phase is <strong>public</strong>. Use this to test layout, copy, and UX safely before activation.
          </p>
        </div>
      </div>

      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-primary">Familiar Favorites Preview</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Internal staging view for the public Familiar Favorites section.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/familiar-favorites" target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Public /familiar-favorites
            </Button>
          </Link>
          <Link to="/admin/recipe-hub">
            <Button variant="outline" size="sm">Manage recipes</Button>
          </Link>
        </div>
      </header>

      {/* Phase filter */}
      <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm">
        {(["all", "off", "admin_preview", "soft_launch", "public"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPhaseFilter(p)}
            className={`px-3 py-1 rounded-full transition-colors ${
              phaseFilter === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p === "all" ? `All (${recipes.length})` : PHASE_LABEL[p]} {p !== "all" && `(${recipes.filter((r) => r.inspired_phase === p).length})`}
          </button>
        ))}
      </div>

      {/* Disclaimer block (matches public page) */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Standard Familiar Favorites disclaimer (shown publicly):</p>
        <p>
          “These dishes are part of our Familiar Favorites collection. They are original recipes inspired by well‑known flavors, created and tested independently.”
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No Familiar Favorites match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {filtered.map((r) => {
            const total = (r.prep_time || 0) + (r.cook_time || 0);
            return (
              <div key={r.id} className="block">
                <div className="aspect-[4/3] bg-secondary rounded-xl overflow-hidden mb-3 relative">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      no photo
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <Badge className={PHASE_BADGE_CLASS[r.inspired_phase]}>
                      {PHASE_LABEL[r.inspired_phase]}
                    </Badge>
                    {r.status !== "published" && (
                      <Badge variant="outline" className="bg-background/80">draft</Badge>
                    )}
                  </div>
                </div>
                <p className="text-[10px] uppercase tracking-widest text-primary mb-1">
                  {r.category || r.cuisine || "Familiar Favorite"}
                </p>
                <h2 className="font-display text-xl text-foreground">{r.name}</h2>
                {r.hook && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.hook}</p>}
                <p className="text-xs text-muted-foreground mt-2">
                  {total > 0 ? `${total} min` : ""}{r.servings ? ` · serves ${r.servings}` : ""}
                </p>
                <div className="mt-3 flex gap-2">
                  <Link to="/recipes/$id" params={{ id: r.id }} target="_blank">
                    <Button size="sm" variant="outline" className="gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Detail
                    </Button>
                  </Link>
                  <Link to="/admin/recipe-hub/$id" params={{ id: r.id }}>
                    <Button size="sm" variant="ghost">Edit</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
