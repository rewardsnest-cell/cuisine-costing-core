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

export const Route = createFileRoute("/catering")({
  head: () => ({
    meta: [
      { title: "Catering — VPS Finest, Aurora Ohio" },
      { name: "description", content: "Corporate, social, and private event catering. Transparent pricing, seasonal menus, and a chef who actually answers your calls." },
      { property: "og:title", content: "Catering — VPS Finest, Aurora Ohio" },
      { property: "og:description", content: "Corporate, social, and private event catering with transparent pricing." },
    ],
  }),
  component: CateringPage,
});

function CateringPage() {
  const hero = useAsset("path-catering");

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="relative pt-16 min-h-[60vh] flex items-center justify-center text-center">
        <div className="absolute inset-0">
          {hero && <img src={hero} alt="Catering" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-foreground/55" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <p className="text-xs tracking-[0.25em] uppercase text-background/75 mb-5">Catering</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-[1.1]">
            Done well.
            <br />
            Done quietly.
          </h1>
          <p className="mt-6 text-lg text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Corporate lunches, holiday parties, social gatherings, and private dinners across Northeast Ohio — every quote includes a real itemized breakdown.
          </p>
        </div>
      </section>

      {/* Three categories */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            What we cater
          </p>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { t: "Corporate", d: "Boxed lunches, all-hands meals, holiday parties." },
              { t: "Social", d: "Birthdays, showers, milestone gatherings." },
              { t: "Private", d: "In-home dinners and intimate chef experiences." },
            ].map((c) => (
              <div key={c.t} className="text-center">
                <h3 className="font-display text-2xl font-bold text-foreground mb-3">{c.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Ready when you are</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-6">
            Tell us about your event.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-10">
            Five minutes, no commitment. We'll come back with a clear, itemized quote.
          </p>
          <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
            Build Your Quote
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
