import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About VPS Finest — Catering in Aurora, Ohio" },
      { name: "description", content: "VPS Finest is a small, chef-led catering company in Aurora, Ohio. We focus on weddings and private events across Northeast Ohio." },
      { property: "og:title", content: "About VPS Finest — Catering in Aurora, Ohio" },
      { property: "og:description", content: "A small, chef-led catering company in Aurora, Ohio focused on weddings and private events." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Heading */}
      <section className="pt-32 pb-12 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">About</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            A small kitchen,
            <br />
            a steady hand.
          </h1>
        </div>
      </section>

      {/* Story */}
      <section className="pb-24">
        <div className="max-w-2xl mx-auto px-6 space-y-6 text-lg text-muted-foreground leading-relaxed font-light">
          <p>
            VPS Finest is a small, chef-led catering company based in Aurora, Ohio. We focus on weddings and private events across Northeast Ohio — the kind of days that deserve careful planning and quiet, capable service.
          </p>
          <p>
            We stay small on purpose. It lets us answer your questions ourselves, write quotes that actually make sense, and show up on the day with everything in order.
          </p>
          <p>
            Alongside catering, we publish a small library of recipes — the ones we cook at home and bring to gatherings.
          </p>
        </div>
      </section>

      {/* How we work */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            How we work
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { t: "Honest planning", d: "Itemized quotes and clear timelines from the first conversation forward." },
              { t: "Steady communication", d: "You'll hear back from a real person — usually the same one — every step of the way." },
              { t: "Calm execution", d: "Quiet setup and attentive service so you can be present at your own event." },
            ].map((v) => (
              <div key={v.t} className="text-center">
                <h2 className="font-display text-xl font-bold text-foreground mb-3">{v.t}</h2>
                <p className="text-muted-foreground leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What we cover */}
      <section className="py-24 bg-background">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-10">
            What we cover
          </p>
          <h2 className="sr-only">Services and service area</h2>
          <p className="text-center text-muted-foreground leading-relaxed text-lg">
            Wedding catering, event and private catering, and a growing collection of recipes.
            Based in Aurora, Ohio and serving Northeast Ohio.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-8">
            Let's plan something calmly.
          </h2>
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

      <PublicFooter />
    </div>
  );
}
