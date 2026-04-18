import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { supabase } from "@/integrations/supabase/client";

type Asset = { slug: string; public_url: string; alt: string | null };

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
      { name: "description", content: "Good food. No stress. Thoughtful catering for weddings and gatherings, plus calm, reliable recipes for everyday cooking." },
      { property: "og:title", content: "VPS Finest — Catering & Recipes in Aurora, Ohio" },
      { property: "og:description", content: "Good food. No stress. Thoughtful catering for weddings and gatherings, plus calm, reliable recipes." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const hero = useAsset("hero-home");
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="relative pt-16 min-h-[88vh] flex items-center">
        <div className="absolute inset-0">
          {hero && (
            <img src={hero} alt="VPS Finest catering" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/70 via-foreground/40 to-transparent" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-2xl">
            <p className="text-background/90 font-medium text-sm tracking-widest uppercase mb-4">VPS Finest · Aurora, Ohio</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-tight">
              Good food. <span className="italic">No stress.</span>
            </h1>
            <p className="mt-6 text-lg text-background/90 max-w-lg leading-relaxed">
              Thoughtful catering for weddings and gatherings, plus calm, reliable recipes for everyday cooking.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-warm transition-all hover:opacity-90">
                Build a Catering Quote
              </Link>
              <Link to="/recipes" className="inline-flex items-center justify-center rounded-lg border border-background/40 bg-background/10 backdrop-blur-sm px-8 py-3.5 text-sm font-semibold text-background transition-all hover:bg-background/20">
                Browse Recipes
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-3">
          {[
            { t: "Weddings", d: "Plated, family-style, or buffet — built around your day.", to: "/weddings" as const },
            { t: "Catering", d: "Corporate, social, and private events with transparent pricing.", to: "/catering" as const },
            { t: "Recipes", d: "Calm, reliable recipes to cook at home all week.", to: "/recipes" as const },
          ].map((c) => (
            <Link key={c.t} to={c.to} className="block bg-secondary rounded-2xl p-8 border border-border hover:shadow-warm transition-shadow">
              <h3 className="font-display text-2xl font-semibold text-primary mb-2">{c.t}</h3>
              <p className="text-muted-foreground leading-relaxed">{c.d}</p>
              <span className="mt-4 inline-block text-primary text-sm font-medium">Explore →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Tell us about your event</h2>
          <p className="text-primary-foreground/80 mb-8 text-lg">Five-minute quote builder. No commitment.</p>
          <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-lg bg-background text-foreground px-8 py-3.5 text-sm font-semibold shadow-warm transition-all hover:bg-background/90">
            Start Your Quote
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
