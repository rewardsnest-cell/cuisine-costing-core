import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { SeasonalCTA } from "@/components/SeasonalCTA";

export const Route = createFileRoute("/blog/winter-wedding-catering-guide")({
  head: () => ({
    meta: [
      { title: "Winter Wedding Catering Guide — Cleveland Area | VPS Finest" },
      { name: "description", content: "A calm guide to planning winter wedding catering across the Cleveland area. Intimate menus, off-season timing, and what to expect." },
      { property: "og:title", content: "Winter Wedding Catering Guide — Cleveland Area" },
      { property: "og:description", content: "Planning, menus, and timing for a winter wedding in the Cleveland area." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: WinterGuide,
});

function WinterGuide() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <article className="pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-accent mb-5">Winter · Guide</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.15] mb-8">
            Why winter weddings around Cleveland are quietly underrated.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            Winter weddings get less attention than they deserve. Smaller guest counts, intimate venues, more flexible dates, and the kind of food that we most love to cook. Here's how we think about catering them.
          </p>

          <div className="space-y-10 text-foreground">
            <section>
              <h2 className="font-display text-2xl font-bold mb-4">When to start planning</h2>
              <p className="text-muted-foreground leading-relaxed">
                Winter is the easiest season to plan. Six to nine months is usually plenty of lead time, and many venues around Cleveland have open Saturdays in December, January, and February. If you're considering an off-season date, you have real flexibility — and often, real savings on venue and vendor costs.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">What's in season</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Winter cooking in Northeast Ohio is honest cooking. Citrus is at its best, root vegetables are sweet from cold storage, and braising cuts of meat are exactly what the weather calls for. Mushrooms, hearty greens, grains, dried beans, slow-simmered stocks — all the things that take time and reward it.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Winter menus tend to feel substantial without being heavy. The goal is food that warms the room, not food that puts everyone to sleep before the dancing starts.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">Venue and service style</h2>
              <p className="text-muted-foreground leading-relaxed">
                Most winter weddings around Cleveland are indoor — downtown ballrooms, historic homes, restaurants with private rooms, art spaces. Plated and family-style service tends to suit the season better than buffet, but there are no rules. We plan around your venue's actual kitchen and service setup, and we're realistic about winter logistics: snow, parking, guest travel, coat check, the whole picture.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">A few menu starting points</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>Mulled wine, warm cheese puffs, gougères, beef on toast for arrival.</li>
                <li>Slow-braised short rib or roasted duck for a generous, seasonal main.</li>
                <li>Wild mushroom risotto as a vegetarian centerpiece — the kind of dish that doesn't feel like an afterthought.</li>
                <li>Buttery mash, roasted winter vegetables, citrus salad to balance the plate.</li>
                <li>Sticky toffee pudding, dark chocolate tart, or a warm fruit crumble for dessert.</li>
              </ul>
              <p className="text-sm text-muted-foreground italic mt-4">
                Every menu is designed for your day. These are starting points, not a fixed list.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">A note on the season</h2>
              <p className="text-muted-foreground leading-relaxed">
                Winter weddings tend to feel deeply personal — fewer guests, more conversation, more attention to the dinner. They suit couples who want a celebration that feels like them rather than a production. That's the kind of wedding we're best at.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-10 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Related:{" "}
              <Link to="/weddings/winter-cleveland-ohio" className="text-accent hover:underline">Winter weddings in the Cleveland area</Link>
              {" · "}
              <Link to="/weddings/booking-timeline" className="text-accent hover:underline">When to book your caterer</Link>
            </p>
          </div>
        </div>
      </article>

      <SeasonalCTA
        heading="Planning a winter wedding?"
        subhead="Winter dates often have more flexibility. Share a few details and we'll come back with a clear next step."
      />

      <PublicFooter />
    </div>
  );
}
