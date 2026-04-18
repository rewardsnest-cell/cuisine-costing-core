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

export const Route = createFileRoute("/weddings")({
  head: () => ({
    meta: [
      { title: "Wedding Catering — VPS Finest, Aurora Ohio" },
      { name: "description", content: "Plated, family-style, and buffet wedding catering across Northeast Ohio. Tastings included. Built around your day, not a template." },
      { property: "og:title", content: "Wedding Catering — VPS Finest" },
      { property: "og:description", content: "Plated, family-style, and buffet wedding catering across Northeast Ohio." },
    ],
  }),
  component: WeddingsPage,
});

function WeddingsPage() {
  const hero = useAsset("hero-weddings") ?? useAsset("path-catering");

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="relative pt-16 min-h-[65vh] flex items-center justify-center text-center">
        <div className="absolute inset-0">
          {hero && <img src={hero} alt="Wedding catering" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-foreground/55" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <p className="text-xs tracking-[0.25em] uppercase text-background/75 mb-5">Weddings</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-[1.1]">
            Built around your day.
          </h1>
          <p className="mt-6 text-lg text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Plated, family-style, or buffet — every menu starts with a tasting and a conversation, not a template.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            How it works
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { n: "01", t: "Tell us about your day", d: "Date, venue, guest count, and the food you actually love." },
              { n: "02", t: "Tasting & menu design", d: "We design a menu around your tastes and bring it to you to taste." },
              { n: "03", t: "Day-of, done right", d: "Quiet, professional service so you can be present." },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <p className="font-display text-3xl text-accent mb-3">{s.n}</p>
                <h3 className="font-display text-xl font-bold text-foreground mb-3">{s.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Let's talk</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-10">
            Start with a quote or a tasting.
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Start Your Quote
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Book a Tasting
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
