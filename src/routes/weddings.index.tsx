import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ListChecks, ArrowRight } from "lucide-react";
import { faqJsonLd } from "@/lib/seo/jsonld";
import { BookingTimeline } from "@/components/BookingTimeline";
import { ServiceAreaBadges } from "@/components/ServiceAreaBadges";
import { useAsset } from "@/lib/use-asset";

export const Route = createFileRoute("/weddings/")({
  head: () => ({
    meta: [
      { title: "Wedding Catering in Aurora, Ohio — VPS Finest" },
      { name: "description", content: "Wedding catering in Aurora, Ohio and Northeast Ohio. Plated, family-style, and buffet menus, tastings included, and calm service on the day." },
      { property: "og:title", content: "Wedding Catering in Aurora, Ohio — VPS Finest" },
      { property: "og:description", content: "Stress-free wedding catering across Northeast Ohio. Tastings included. Built around your day." },
    ],
    scripts: [faqJsonLd(FAQS)],
  }),
  component: WeddingsPage,
});

const FAQS = [
  {
    q: "How far in advance should we book our wedding caterer?",
    a: "Six to twelve months is typical for weddings in Aurora, Ohio and the surrounding area, especially for spring and fall dates. We're happy to talk earlier — and sometimes later — depending on the date.",
  },
  {
    q: "Do you offer tastings?",
    a: "Yes. Once we've shaped a draft menu together, we'll bring you in for a tasting so you can adjust dishes before we lock anything in.",
  },
  {
    q: "What service styles do you offer?",
    a: "Plated, family-style, and buffet, plus stations and passed bites for cocktail hour. We'll recommend what fits your venue, guest count, and timeline.",
  },
  {
    q: "Do you travel outside Aurora, Ohio?",
    a: "Yes. We regularly cater weddings across Northeast Ohio. Travel is itemized in your quote, so you can see exactly what's included.",
  },
  {
    q: "Can you handle dietary needs and allergies?",
    a: "Yes. Share your guest list considerations early and we'll design the menu so everyone is genuinely taken care of — not given an afterthought plate.",
  },
];

function WeddingsPage() {
  const weddingsHero = useAsset("hero-weddings");
  const cateringFallback = useAsset("path-catering");
  const hero = weddingsHero.url ?? cateringFallback.url;
  const heroLoading = weddingsHero.loading || (!hero && cateringFallback.loading);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative pt-16 min-h-[65vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          {heroLoading && !hero && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/80 to-secondary" aria-hidden="true" />
          )}
          {hero && <img src={hero} alt="Wedding catering in Aurora, Ohio" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-foreground/55" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <p className="text-xs tracking-[0.25em] uppercase text-background/75 mb-5">Wedding Catering</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-[1.1]">
            A calm wedding day,
            <br />
            served well.
          </h1>
          <p className="mt-6 text-lg text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Wedding catering in Aurora, Ohio and across Northeast Ohio — built around your day, your venue, and the food you actually love.
          </p>
        </div>
      </section>

      {/* What you can expect */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            What you can expect
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { t: "A real conversation", d: "We start by listening — to your day, your venue, and the food that means something to you." },
              { t: "A menu, not a template", d: "Plated, family-style, or buffet. Designed around your guests and finalized at a tasting." },
              { t: "Calm, professional service", d: "Quiet setup, attentive service, and tidy cleanup. You get to be present." },
            ].map((v) => (
              <div key={v.t} className="text-center">
                <h2 className="font-display text-xl font-bold text-foreground mb-3">{v.t}</h2>
                <p className="text-muted-foreground leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            How it works
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { n: "01", t: "Tell us about your day", d: "Date, venue, guest count, and the food you love. We'll reply with a clear next step." },
              { n: "02", t: "Tasting & menu design", d: "We design a draft menu, then bring it to you to taste and refine together." },
              { n: "03", t: "Day-of, done right", d: "Quiet, professional service so you can be present — not managing the kitchen." },
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

      {/* Start your wedding quote */}
      <section className="py-24 bg-background border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Start your wedding quote</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
              Two thoughtful ways to begin.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Build a draft menu yourself, or let our concierge help shape it with you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <Card
              className="cursor-pointer transition-all hover:shadow-warm hover:border-primary/40 group"
              onClick={() => navigate({ to: "/catering/quote" })}
            >
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center">
                    <ListChecks className="w-5 h-5 text-foreground" />
                  </div>
                  <h3 className="font-display text-2xl font-semibold">Wedding Menu Builder</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Step through a guided wizard — service style, courses, and tier. A calm starting point for your wedding menu.
                </p>
                <Button className="w-full bg-gradient-warm text-primary-foreground gap-2 group-hover:translate-x-0.5 transition-transform">
                  Start Menu Builder <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:shadow-warm hover:border-primary/40 group ring-1 ring-primary/20"
              onClick={() => navigate({ to: "/quote/ai", search: { context: "wedding" } })}
            >
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg bg-gradient-warm flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <h3 className="font-display text-2xl font-semibold">Wedding Concierge</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Chat with our AI wedding concierge. It asks thoughtful questions and designs a tailored menu around your day.
                </p>
                <Button variant="outline" className="w-full gap-2 group-hover:translate-x-0.5 transition-transform">
                  Start a Conversation <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            Prefer to talk first? <Link to="/contact" className="text-primary hover:underline">Reach out directly</Link>
          </p>
        </div>
      </section>

      <BookingTimeline variant="compact" />

      {/* FAQ */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-12">
            Wedding catering FAQ
          </p>
          <h2 className="sr-only">Wedding catering frequently asked questions</h2>
          <div className="space-y-10">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-display text-xl font-bold text-foreground mb-3">{f.q}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.a}</p>
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
            Start a wedding catering inquiry.
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Start a wedding inquiry
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Book a tasting
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
