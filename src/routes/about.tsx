import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — VPS Finest" },
      { name: "description", content: "VPS Finest is a chef-led catering and recipe studio in Aurora, Ohio. Good food. No stress." },
      { property: "og:title", content: "About — VPS Finest" },
      { property: "og:description", content: "Chef-led catering and recipe studio in Aurora, Ohio." },
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
            Good food.
            <br />
            No stress.
          </h1>
        </div>
      </section>

      {/* Story */}
      <section className="pb-24">
        <div className="max-w-2xl mx-auto px-6 space-y-6 text-lg text-muted-foreground leading-relaxed font-light">
          <p>
            VPS Finest is a small, chef-led catering studio based in Aurora, Ohio. We cook for weddings, corporate events, and private gatherings across Northeast Ohio.
          </p>
          <p>
            Our approach is simple: real ingredients, transparent pricing, and a chef who actually answers your calls. We publish the recipes we cook at home, too.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            How we work
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { t: "Real food", d: "Seasonal ingredients, cooked from scratch — never warmed-over." },
              { t: "Honest pricing", d: "Itemized quotes. No surprise fees the week of your event." },
              { t: "Calm service", d: "We handle the details so you can be present on the day." },
            ].map((v) => (
              <div key={v.t} className="text-center">
                <h3 className="font-display text-2xl font-bold text-foreground mb-3">{v.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-8">
            Let's cook something together.
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Get a Quote
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
