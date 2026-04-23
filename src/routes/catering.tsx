import { createFileRoute, Link } from "@tanstack/react-router";
import { useAsset } from "@/lib/use-asset";

export const Route = createFileRoute("/catering")({
  head: () => ({
    meta: [
      { title: "Event & Private Catering in Aurora, Ohio — VPS Finest" },
      { name: "description", content: "Event and private catering in Aurora, Ohio and Northeast Ohio. Corporate lunches, holiday parties, showers, and private dinners with itemized quotes." },
      { property: "og:title", content: "Event & Private Catering — Aurora, Ohio" },
      { property: "og:description", content: "Corporate lunches, holiday parties, and private dinners. Calm planning and clear quotes." },
    ],
  }),
  component: CateringPage,
});

const FAQS = [
  {
    q: "What kinds of events do you cater?",
    a: "Corporate lunches, all-hands meals, holiday parties, birthdays, showers, milestone gatherings, and private in-home dinners across Aurora, Ohio and Northeast Ohio. Wedding catering has its own page.",
  },
  {
    q: "How far in advance should I book event catering?",
    a: "Four to six weeks is comfortable for most events. We can sometimes accommodate shorter timelines — reach out and we'll tell you honestly what's possible.",
  },
  {
    q: "Do you provide staff, rentals, and setup?",
    a: "Yes. Quotes are itemized, so you can see exactly what's included — food, service staff, rentals, setup, and cleanup — and adjust anything that doesn't fit.",
  },
  {
    q: "Can you accommodate dietary restrictions?",
    a: "Yes. Tell us about allergies and preferences when you start your quote, and we'll design around them.",
  },
];

function CateringPage() {
  const { url: hero, loading: heroLoading } = useAsset("path-catering");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative pt-16 min-h-[60vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          {heroLoading && !hero && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/80 to-secondary" aria-hidden="true" />
          )}
          {hero && <img src={hero} alt="Event catering in Aurora, Ohio" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-foreground/55" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <p className="text-xs tracking-[0.25em] uppercase text-background/75 mb-5">Event & Private Catering</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-[1.1]">
            Catering, done quietly.
          </h1>
          <p className="mt-6 text-lg text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Event catering in Aurora, Ohio for corporate lunches, holiday parties, social gatherings, and private dinners across Northeast Ohio.
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            What we cater
          </p>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { t: "Corporate", d: "Boxed lunches, all-hands meals, board lunches, and holiday parties for teams in Aurora and Northeast Ohio." },
              { t: "Social", d: "Birthdays, showers, anniversaries, and milestone gatherings — sized to the room and the moment." },
              { t: "Private", d: "In-home dinners and intimate chef experiences for small groups who want the day to feel easy." },
            ].map((c) => (
              <div key={c.t} className="text-center">
                <h2 className="font-display text-2xl font-bold text-foreground mb-3">{c.t}</h2>
                <p className="text-muted-foreground leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            How it works
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { n: "01", t: "Tell us the basics", d: "Date, guest count, location, and a sense of what you'd like to serve." },
              { n: "02", t: "Get an itemized quote", d: "Clear pricing for food, service, rentals, and setup — nothing hidden." },
              { n: "03", t: "We handle the day", d: "Quiet setup, attentive service, calm cleanup. You stay with your guests." },
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

      {/* FAQ */}
      <section className="py-24 bg-background border-t border-border">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-12">
            Catering FAQ
          </p>
          <h2 className="sr-only">Catering frequently asked questions</h2>
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
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">Ready when you are</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-6">
            Tell us about your event.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-10">
            A few minutes, no commitment. We'll come back with a clear, itemized quote.
          </p>
          <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
            Request catering information
          </Link>
        </div>
      </section>
    </div>
  );
}
