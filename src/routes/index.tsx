import { createFileRoute, Link } from "@tanstack/react-router";
import { TestimonialsCarousel } from "@/components/TestimonialsCarousel";
import { FloatingQuoteCTA } from "@/components/FloatingQuoteCTA";
import { ServiceAreaBadges } from "@/components/ServiceAreaBadges";
import { TwoDoors } from "@/components/TwoDoors";
import { PromisesStrip } from "@/components/PromisesStrip";
import { GuaranteeBadge } from "@/components/GuaranteeBadge";
import { useAsset } from "@/lib/use-asset";
import heroHomeStatic from "@/assets/site/hero-home.jpg";
import pathCateringStatic from "@/assets/site/path-catering.jpg";
import pathRecipesStatic from "@/assets/site/path-recipes.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VPS Finest — Wedding & Event Catering in Aurora, Ohio" },
      { name: "description", content: "Professional wedding and event catering from Aurora, Ohio. Itemized quotes, tastings included, organized execution. Serving Hudson, Cleveland, Akron and all of Northeast Ohio." },
      { property: "og:title", content: "VPS Finest — Wedding & Event Catering in Aurora, Ohio" },
      { property: "og:description", content: "Professional wedding and event catering. Itemized quotes. Tastings included. Aurora · Northeast Ohio." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { url: heroOverride } = useAsset("hero-home");
  const { url: recipesOverride } = useAsset("path-recipes");
  const { url: cateringOverride } = useAsset("path-catering");
  const hero = heroOverride ?? heroHomeStatic;
  const recipesImg = recipesOverride ?? pathRecipesStatic;
  const cateringImg = cateringOverride ?? pathCateringStatic;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero — calm, single promise, two clear CTAs */}
      <section className="relative pt-16 min-h-[82vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          <img
            src={hero}
            alt="VPS Finest wedding and event catering in Aurora, Ohio"
            className="w-full h-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-foreground/65" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-24">
          <p className="text-xs tracking-[0.2em] uppercase text-background/80 mb-6">
            Aurora, Ohio · Wedding & Event Catering
          </p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-background leading-[1.1]">
            Catering for weddings and curated events.
          </h1>
          <p className="mt-7 text-lg text-background/90 max-w-xl mx-auto leading-relaxed">
            Organized planning, itemized quotes, and quiet execution — from a team that does this every weekend.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              to="/weddings"
              className="inline-flex items-center justify-center rounded-md bg-primary px-7 py-3.5 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity w-full sm:w-auto"
            >
              Explore Weddings
            </Link>
            <Link
              to="/catering/quote"
              className="inline-flex items-center justify-center rounded-md border border-background/40 bg-background/10 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold tracking-wide text-background hover:bg-background/20 transition-colors w-full sm:w-auto"
            >
              Start a Quote
            </Link>
          </div>
        </div>
      </section>

      {/* Two paths — Weddings dominant, Events secondary */}
      <TwoDoors weddingImg={cateringImg} eventImg={recipesImg} emphasis="weddings" />

      {/* Three operational promises */}
      <PromisesStrip />

      {/* Guarantee — quiet reassurance band */}
      <section className="py-10 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6 flex justify-center">
          <GuaranteeBadge />
        </div>
      </section>

      {/* Social proof */}
      <section className="py-24 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr] items-center">
            <div className="text-center md:text-left">
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">Trusted across NE Ohio</p>
              <p className="font-display text-5xl sm:text-6xl font-semibold text-foreground leading-none">100+</p>
              <p className="mt-2 text-sm text-muted-foreground">weddings and events served across Aurora, Hudson, Cleveland, and Akron.</p>
            </div>
            <div>
              <TestimonialsCarousel />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-secondary border-b border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">How it works</p>
          <h2 className="text-center font-display text-3xl sm:text-4xl font-semibold text-foreground mb-14">
            Three steps.
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { n: "01", t: "Tell us the basics", d: "Date, guest count, location, and a sense of what you'd like to serve." },
              { n: "02", t: "Receive an itemized quote", d: "Clear pricing for food, service, rentals, and setup — nothing hidden." },
              { n: "03", t: "We handle the day", d: "Organized setup, attentive service, clean breakdown. You stay with your guests." },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <p className="font-display text-3xl text-accent mb-3">{s.n}</p>
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">{s.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secondary awareness — text-only, low key */}
      <section className="py-12 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <Link to="/menu" className="hover:text-foreground transition-colors">
              Browse menus →
            </Link>
            <span aria-hidden="true" className="hidden sm:inline text-border">·</span>
            <Link to="/recipes" className="hover:text-foreground transition-colors">
              Recipes →
            </Link>
            <span aria-hidden="true" className="hidden sm:inline text-border">·</span>
            <Link to="/follow" className="hover:text-foreground transition-colors">
              Follow along →
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-6">Planning something</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-foreground mb-6">
            Tell us about your event.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-10">
            A few details is all we need to start. We'll come back with a clear, itemized quote within one business day.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/weddings" className="inline-flex items-center justify-center rounded-md bg-primary px-7 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Wedding inquiry
            </Link>
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-md border border-foreground/30 px-7 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Event quote
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-md px-7 py-3 text-sm font-semibold tracking-wide text-foreground hover:text-primary transition-colors">
              Contact →
            </Link>
          </div>
          <div className="mt-8 flex justify-center">
            <ServiceAreaBadges />
          </div>
        </div>
      </section>

      <FloatingQuoteCTA />
    </div>
  );
}
