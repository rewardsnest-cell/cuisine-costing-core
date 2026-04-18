import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { BookingTimeline } from "@/components/BookingTimeline";
import { SeasonalCTA } from "@/components/SeasonalCTA";
import { localBusinessJsonLd, SITE_URL } from "@/lib/seo/jsonld";

export const Route = createFileRoute("/weddings/spring-aurora-ohio")({
  head: () => ({
    meta: [
      { title: "Spring Wedding Catering in Aurora, Ohio — VPS Finest" },
      { name: "description", content: "Spring wedding catering in Aurora, Ohio. Seasonal menus, calm planning, and itemized quotes for couples planning a March, April, or May wedding in Northeast Ohio." },
      { property: "og:title", content: "Spring Wedding Catering in Aurora, Ohio — VPS Finest" },
      { property: "og:description", content: "Seasonal spring wedding catering in Aurora, Ohio and Northeast Ohio. Tastings included." },
    ],
    scripts: [
      localBusinessJsonLd({
        url: `${SITE_URL}/weddings/spring-aurora-ohio`,
        description: "Spring wedding catering in Aurora, Ohio and Northeast Ohio.",
        primaryCity: "Aurora, Ohio",
      }),
    ],
  }),
  component: SpringAuroraPage,
});

function SpringAuroraPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="pt-32 pb-20 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Spring weddings · Aurora, Ohio</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.1] mb-6">
            Spring wedding catering in Aurora, Ohio.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Spring in Northeast Ohio is gentle and unhurried — bright greens, cool mornings, and the first proper farmers' markets of the year. We design wedding menus that feel like the season: light, fresh, and quietly thoughtful.
          </p>
        </div>
      </section>

      <section className="py-20 bg-secondary border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-6">What spring weddings here look like</h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed text-lg">
            <p>
              Most of our Aurora, Ohio spring weddings fall between late April and the end of May, when venues open up and the weather has settled into something dependable. Couples often choose garden ceremonies, barn receptions, or estate venues nearby in Bainbridge, Hudson, and Chagrin Falls.
            </p>
            <p>
              We build menus around what's genuinely in season — early greens, asparagus, herbs, rhubarb, and the first strawberries — alongside the comfort dishes you actually want to eat at your wedding. Plated, family-style, or buffet, finalized at a tasting.
            </p>
            <p>
              Spring in Northeast Ohio can still surprise you with a cold afternoon. We plan for it: warm passed bites during cocktail hour, an indoor backup for plating, and a kitchen setup that doesn't depend on perfect weather.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-background border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-10">A sense of the menu</h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { t: "Cocktail hour", d: "Spring pea crostini, herbed goat cheese, lemon-roasted chicken skewers, warm passed bites for cool evenings." },
              { t: "Mains", d: "Roasted spring chicken, herb-crusted lamb, pan-seared trout, or a vegetable-forward plate built around the market that week." },
              { t: "Sides & sweets", d: "Asparagus with brown butter, new potatoes, simple greens. Strawberry-rhubarb tarts and lemon olive oil cake for dessert." },
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
            Planning further ahead? Read our{" "}
            <Link to="/blog/spring-wedding-catering-guide" className="text-accent hover:underline">spring wedding catering guide</Link>
            {" "}or explore{" "}
            <Link to="/weddings/fall-hudson-ohio" className="text-accent hover:underline">fall weddings in Hudson</Link>.
          </p>
        </div>
      </section>

      <SeasonalCTA
        heading="Tell us about your spring wedding."
        subhead="Share your date, venue, and a few details. We'll come back with a clear, itemized quote — no pressure, no hard sell."
      />

      <PublicFooter />
    </div>
  );
}
