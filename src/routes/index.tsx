import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { supabase } from "@/integrations/supabase/client";

function useAsset(slug: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (supabase as any)
      .from("site_asset_manifest")
      .select("public_url")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }: any) => { if (data?.public_url) setUrl(data.public_url); });
  }, [slug]);
  return url;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VPS Finest — Catering & Recipes in Aurora, Ohio" },
      { name: "description", content: "Good food. No stress. Thoughtful catering for your events, and calm recipes for everyday cooking. Aurora, Ohio and surrounding areas." },
      { property: "og:title", content: "VPS Finest — Catering & Recipes in Aurora, Ohio" },
      { property: "og:description", content: "Thoughtful catering for your events, and calm recipes for everyday cooking." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const hero = useAsset("hero-home");
  const recipesImg = useAsset("path-recipes");
  const cateringImg = useAsset("path-catering");

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero — dark food photo, centered serif headline */}
      <section className="relative pt-16 min-h-[92vh] flex items-center justify-center text-center">
        <div className="absolute inset-0">
          {hero && (
            <img src={hero} alt="VPS Finest catering spread" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-foreground/55" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-24">
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-background leading-[1.05]">
            Good food.
            <br />
            No stress.
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Thoughtful catering for your events, and calm recipes for everyday cooking.
          </p>
          <p className="mt-6 text-xs tracking-[0.25em] uppercase text-background/75">
            Aurora, Ohio and surrounding areas
          </p>
        </div>
      </section>

      {/* What brings you here — two large image cards */}
      <section className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            What brings you here?
          </p>
          <div className="grid gap-8 md:grid-cols-2">
            {[
              { t: "Browse Recipes", k: "For home cooks", d: "Calm, reliable recipes for weeknights, make-ahead meals, and gatherings.", to: "/recipes" as const, img: recipesImg },
              { t: "Explore Catering", k: "For events & weddings", d: "Thoughtful catering for weddings, gatherings, and special occasions.", to: "/catering" as const, img: cateringImg },
            ].map((c) => (
              <Link key={c.t} to={c.to} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  {c.img ? (
                    <img src={c.img} alt={c.t} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-muted to-secondary" />
                  )}
                  <div className="absolute inset-0 bg-foreground/30 group-hover:bg-foreground/20 transition-colors" />
                </div>
                <div className="pt-6 text-center">
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">{c.k}</p>
                  <h3 className="font-display text-2xl font-bold text-foreground mb-3">{c.t}</h3>
                  <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto">{c.d}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* About strip */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Real food, made with care.</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-6">
            A small kitchen with a steady hand.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg">
            VPS Finest is a small catering company based in Aurora, Ohio. We believe good food shouldn't be complicated — whether you're planning a wedding or just trying to get dinner on the table.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Get a Quote
            </Link>
            <Link to="/about" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              About Us
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
