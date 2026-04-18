import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { BookingTimeline } from "@/components/BookingTimeline";
import { SeasonalCTA } from "@/components/SeasonalCTA";
import { localBusinessJsonLd, SITE_URL } from "@/lib/seo/jsonld";

export const Route = createFileRoute("/weddings/winter-cleveland-ohio")({
  head: () => ({
    meta: [
      { title: "Winter Wedding Catering in the Cleveland Area — VPS Finest" },
      { name: "description", content: "Winter wedding catering across the Cleveland area and Northeast Ohio. Warm, generous menus and calm planning for off-season weddings." },
      { property: "og:title", content: "Winter Wedding Catering in the Cleveland Area — VPS Finest" },
      { property: "og:description", content: "Warm winter wedding catering across Cleveland and Northeast Ohio. Tastings included." },
    ],
    scripts: [
      localBusinessJsonLd({
        url: `${SITE_URL}/weddings/winter-cleveland-ohio`,
        description: "Winter wedding catering across the Cleveland area and Northeast Ohio.",
        primaryCity: "Cleveland, Ohio",
      }),
    ],
  }),
  component: WinterClevelandPage,
});

function WinterClevelandPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="pt-32 pb-20 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Winter weddings · Cleveland area</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.1] mb-6">
            Winter wedding catering in the Cleveland area.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Winter weddings in Cleveland have a quiet kind of magic — candlelight, good wine, and food that warms the room. We design menus that lean into the season honestly: generous, comforting, and put together with care.
          </p>
        </div>
      </section>

      <section className="py-20 bg-secondary border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-6">What winter weddings here look like</h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed text-lg">
            <p>
              December, January, and February weddings around Cleveland tend to be more intimate — smaller guest counts, indoor venues, and an emphasis on the dinner itself. Many couples choose downtown ballrooms, historic homes, or restaurants with private rooms.
            </p>
            <p>
              Winter is when we cook the food we love most: braises, roasts, slow-simmered grains, citrus, root vegetables, and proper desserts. We design menus that feel substantial without being heavy, and we plan service around indoor logistics so the cold never becomes a problem.
            </p>
            <p>
              Off-season often means more flexible dates and venue availability. It's a good window for couples who want a calmer planning process and a wedding that feels deeply personal rather than performative.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-background border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-10">A sense of the menu</h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { t: "Cocktail hour", d: "Mulled wine, warm cheese puffs, beef on toast, smoked trout, gougères straight from the oven." },
              { t: "Mains", d: "Slow-braised short rib, roasted duck, herb-crusted pork loin, or a wild mushroom risotto for a vegetarian centerpiece." },
              { t: "Sides & sweets", d: "Buttery mash, roasted winter vegetables, citrus salad. Sticky toffee pudding, dark chocolate tart, or a warm fruit crumble." },
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
            <Link to="/blog/winter-wedding-catering-guide" className="text-accent hover:underline">winter wedding catering guide</Link>
            {" "}or see{" "}
            <Link to="/weddings/spring-aurora-ohio" className="text-accent hover:underline">spring weddings in Aurora</Link>.
          </p>
        </div>
      </section>

      <SeasonalCTA
        heading="Tell us about your winter wedding."
        subhead="Winter dates often have more flexibility. Share a few details and we'll come back with a clear, itemized quote."
      />

      <PublicFooter />
    </div>
  );
}
