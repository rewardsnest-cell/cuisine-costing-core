import { createFileRoute, Link } from "@tanstack/react-router";
import { TestimonialsCarousel } from "@/components/TestimonialsCarousel";
import { FloatingQuoteCTA } from "@/components/FloatingQuoteCTA";
import { PhotoGrid } from "@/components/PhotoGrid";
import { ServiceAreaBadges } from "@/components/ServiceAreaBadges";
import { useAsset } from "@/lib/use-asset";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VPS Finest — Wedding & Event Catering in Aurora, Ohio" },
      { name: "description", content: "Thoughtful wedding and event catering in Aurora, Ohio. Calm planning, clear quotes, and food that takes care of your guests." },
      { property: "og:title", content: "VPS Finest — Wedding & Event Catering in Aurora, Ohio" },
      { property: "og:description", content: "Thoughtful wedding and event catering in Aurora, Ohio. Good food. No stress." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { url: hero, loading: heroLoading } = useAsset("hero-home");
  const { url: recipesImg } = useAsset("path-recipes");
  const { url: cateringImg } = useAsset("path-catering");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative pt-16 min-h-[92vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          {heroLoading && !hero && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/80 to-secondary" aria-hidden="true" />
          )}
          {hero && (
            <img src={hero} alt="VPS Finest wedding and event catering in Aurora, Ohio" className="w-full h-full object-cover" />
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
            Wedding and event catering for couples and hosts who want their day to feel calm, clear, and well taken care of.
          </p>
          <p className="mt-6 text-xs tracking-[0.25em] uppercase text-background/75">
            Aurora, Ohio · Northeast Ohio
          </p>
          <div className="mt-8">
            <ServiceAreaBadges tone="light" />
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            What we do
          </p>
          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                t: "Wedding Catering",
                k: "For couples",
                d: "Plated, family-style, or buffet wedding catering across Aurora and Northeast Ohio. Tastings included.",
                to: "/weddings" as const,
                img: cateringImg,
                cta: "Start a wedding inquiry",
              },
              {
                t: "Event & Private Catering",
                k: "For hosts & teams",
                d: "Corporate lunches, holiday parties, showers, and private dinners with clear, itemized pricing.",
                to: "/catering" as const,
                img: recipesImg,
                cta: "Request catering information",
              },
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
                  <h2 className="font-display text-2xl font-bold text-foreground mb-3">{c.t}</h2>
                  <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto">{c.d}</p>
                  <p className="mt-4 text-xs tracking-[0.2em] uppercase text-accent group-hover:underline">{c.cta} →</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why hosts choose us */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            Why hosts choose us
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { t: "Clear from the start", d: "Itemized quotes, honest timelines, and no surprises in the final week." },
              { t: "Calm on the day", d: "Quiet, professional service so you can be a guest at your own event." },
              { t: "Local to Aurora", d: "Based in Aurora, Ohio and serving Northeast Ohio venues we know well." },
            ].map((v) => (
              <div key={v.t} className="text-center">
                <h3 className="font-display text-xl font-bold text-foreground mb-3">{v.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
          <TestimonialsCarousel />
        </div>
      </section>

      {/* Recipes strip */}
      <section className="py-24 bg-background">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Also from our kitchen</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-6">
            Recipes we cook at home.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-8">
            A small, growing collection of reliable recipes — the ones we make on weeknights and bring to gatherings.
          </p>
          <Link to="/recipes" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
            Browse recipes
          </Link>
        </div>
      </section>

      <PhotoGrid />

      {/* CTA */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Planning something?</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-6">
            Tell us about your day.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-10">
            A few details is all we need to start. We'll come back with a clear, itemized quote.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Start a quote
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Contact us
            </Link>
          </div>
        </div>
      </section>
      <FloatingQuoteCTA />
    </div>
  );
}
