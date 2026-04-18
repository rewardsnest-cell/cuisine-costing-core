import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { BookingTimeline } from "@/components/BookingTimeline";
import { SeasonalCTA } from "@/components/SeasonalCTA";
import { localBusinessJsonLd, SITE_URL } from "@/lib/seo/jsonld";

export const Route = createFileRoute("/weddings/fall-hudson-ohio")({
  head: () => ({
    meta: [
      { title: "Fall Wedding Catering in Hudson, Ohio — VPS Finest" },
      { name: "description", content: "Fall wedding catering in Hudson, Ohio. Seasonal menus built around Northeast Ohio's harvest, with calm planning and itemized quotes." },
      { property: "og:title", content: "Fall Wedding Catering in Hudson, Ohio — VPS Finest" },
      { property: "og:description", content: "Seasonal fall wedding catering in Hudson, Ohio and across Northeast Ohio. Tastings included." },
    ],
    scripts: [
      localBusinessJsonLd({
        url: `${SITE_URL}/weddings/fall-hudson-ohio`,
        description: "Fall wedding catering in Hudson, Ohio and Northeast Ohio.",
        primaryCity: "Hudson, Ohio",
      }),
    ],
  }),
  component: FallHudsonPage,
});

function FallHudsonPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="pt-32 pb-20 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Fall weddings · Hudson, Ohio</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.1] mb-6">
            Fall wedding catering in Hudson, Ohio.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Fall is our busiest season for a reason. The light is warmer, the venues across Hudson and Northeast Ohio are at their best, and the food we love to cook is finally in season. We build menus that feel like a real Ohio harvest — quietly generous, never overdone.
          </p>
        </div>
      </section>

      <section className="py-20 bg-secondary border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-6">What fall weddings here look like</h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed text-lg">
            <p>
              September through early November is peak wedding season in Hudson, Ohio and the surrounding area. Venues book up quickly — we typically recommend reaching out nine to twelve months ahead for a fall Saturday.
            </p>
            <p>
              Fall menus give us the most to work with: roasted root vegetables, late-season tomatoes, apples and pears, braised meats, and the kind of bread and cheese course that makes guests slow down. We design plated, family-style, or buffet service that feels like the season without leaning on cliché.
            </p>
            <p>
              We know the Hudson and Western Reserve venues well — historic homes, barns, and estates that each ask for a slightly different setup. Travel and logistics are itemized in your quote so nothing about the day is a surprise.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-background border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-10">A sense of the menu</h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { t: "Cocktail hour", d: "Butternut squash crostini, baked brie with apple, beef tenderloin on toast, warm cider, simple cheese and charcuterie." },
              { t: "Mains", d: "Braised short rib, herb-roasted chicken, pan-seared salmon, or a wild mushroom and grain plate built around the harvest." },
              { t: "Sides & sweets", d: "Roasted root vegetables, brown butter farro, garlicky greens. Apple galette, pumpkin pot de crème, or a small wedding cake." },
            ].map((m) => (
              <div key={m.t}>
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">{m.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{m.d}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground italic mt-10">
            Every menu is designed for your day — these are starting points, not a fixed list.
          </p>
        </div>
      </section>

      <BookingTimeline variant="compact" />

      <section className="py-16 bg-secondary border-t border-border">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Read the full{" "}
            <Link to="/blog/fall-wedding-catering-guide" className="text-accent hover:underline">fall wedding catering guide</Link>
            {" "}or see{" "}
            <Link to="/weddings/winter-cleveland-ohio" className="text-accent hover:underline">winter weddings in Cleveland</Link>.
          </p>
        </div>
      </section>

      <SeasonalCTA
        heading="Tell us about your fall wedding."
        subhead="Fall weekends fill quickly across Northeast Ohio. Share a few details and we'll reply with a clear next step."
      />

      <PublicFooter />
    </div>
  );
}
