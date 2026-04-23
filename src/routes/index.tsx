import { createFileRoute, Link } from "@tanstack/react-router";
import { TestimonialsCarousel } from "@/components/TestimonialsCarousel";
import { FloatingQuoteCTA } from "@/components/FloatingQuoteCTA";
import { PhotoGrid } from "@/components/PhotoGrid";
import { ServiceAreaBadges } from "@/components/ServiceAreaBadges";
import { TwoDoors } from "@/components/TwoDoors";
import { PromisesStrip } from "@/components/PromisesStrip";
import { GuaranteeBadge } from "@/components/GuaranteeBadge";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { useAsset } from "@/lib/use-asset";
import heroHomeStatic from "@/assets/site/hero-home.jpg";
import pathCateringStatic from "@/assets/site/path-catering.jpg";
import pathRecipesStatic from "@/assets/site/path-recipes.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VPS Finest — Wedding & Event Catering in Aurora, Ohio" },
      { name: "description", content: "Calm, itemized wedding and event catering from Aurora, Ohio. Tastings included. No surprise pricing. Serving Hudson, Cleveland, Akron and all of Northeast Ohio." },
      { property: "og:title", content: "VPS Finest — Wedding & Event Catering in Aurora, Ohio" },
      { property: "og:description", content: "Calm, itemized wedding and event catering. Tastings included. No surprise pricing. Aurora · Northeast Ohio." },
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
      {/* Hero — one promise, two clear CTAs */}
      <section className="relative pt-16 min-h-[88vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          <img
            src={hero}
            alt="VPS Finest wedding and event catering in Aurora, Ohio"
            className="w-full h-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-foreground/60" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-background/80 mb-6">
            Aurora, Ohio · Northeast Ohio
          </p>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-background leading-[1.05]">
            Wedding & event catering,
            <br />
            done quietly.
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Calm, itemized catering from Aurora — for couples and hosts who want their day to feel taken care of.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              to="/weddings"
              className="inline-flex items-center justify-center rounded-md bg-primary px-7 py-3.5 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity w-full sm:w-auto"
            >
              Start a wedding inquiry
            </Link>
            <Link
              to="/catering/quote"
              className="inline-flex items-center justify-center rounded-md border border-background/40 bg-background/10 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold tracking-wide text-background hover:bg-background/20 transition-colors w-full sm:w-auto"
            >
              Get an event quote
            </Link>
          </div>
          <div className="mt-8 flex justify-center">
            <GuaranteeBadge className="bg-background/15 border-background/30 text-background" />
          </div>
        </div>
      </section>

      {/* Two clear doors — Couples vs Hosts */}
      <TwoDoors weddingImg={cateringImg} eventImg={recipesImg} />

      {/* Three calm promises */}
      <PromisesStrip />

      {/* Social proof — testimonials + a single bold stat */}
      <section className="py-20 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr] items-center mb-10">
            <div className="text-center md:text-left">
              <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Trusted across NE Ohio</p>
              <p className="font-display text-5xl sm:text-6xl font-bold text-foreground leading-none">100+</p>
              <p className="mt-2 text-sm text-muted-foreground">weddings & events served across Aurora, Hudson, Cleveland, and Akron.</p>
            </div>
            <div>
              <TestimonialsCarousel />
            </div>
          </div>
        </div>
      </section>

      {/* How it works — calm 3-step pattern */}
      <section className="py-20 bg-secondary border-b border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">How it works</p>
          <h2 className="text-center font-display text-3xl sm:text-4xl font-bold text-foreground mb-14">
            Three calm steps.
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { n: "01", t: "Tell us the basics", d: "Date, guest count, location, and a sense of what you'd like to serve." },
              { n: "02", t: "Get an itemized quote", d: "Clear pricing for food, service, rentals, and setup — nothing hidden." },
              { n: "03", t: "We handle the day", d: "Quiet setup, attentive service, calm cleanup. You stay with your guests." },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <p className="font-display text-3xl text-accent mb-3">{s.n}</p>
                <h3 className="font-display text-xl font-bold text-foreground mb-3">{s.t}</h3>
                <p className="text-muted-foreground leading-relaxed font-light">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recipe lead magnet — converts browsers into emails */}
      <section className="py-20 bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">From our kitchen</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              The free Weeknight Recipe Guide.
            </h2>
            <p className="text-muted-foreground leading-relaxed font-light max-w-xl mx-auto">
              Five reliable recipes Victoria cooks at home. A calm intro to how we cook — no pressure, unsubscribe anytime.
            </p>
          </div>
          <NewsletterSignup source="home_lead_magnet" />
          <div className="text-center mt-6">
            <Link to="/recipes" className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
              Or browse the full recipe library →
            </Link>
          </div>
        </div>
      </section>

      <PhotoGrid />

      {/* Final CTA */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Planning something?</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-6">
            Tell us about your day.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-10 font-light">
            A few details is all we need to start. We'll come back with a clear, itemized quote within one business day.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/weddings" className="inline-flex items-center justify-center rounded-md bg-primary px-7 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Wedding inquiry
            </Link>
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-md border border-foreground/30 px-7 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Event quote
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-md px-7 py-3 text-sm font-semibold tracking-wide text-foreground hover:text-accent transition-colors">
              Just say hi →
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
