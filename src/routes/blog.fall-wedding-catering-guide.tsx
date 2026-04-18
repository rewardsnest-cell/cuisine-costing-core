import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { SeasonalCTA } from "@/components/SeasonalCTA";

export const Route = createFileRoute("/blog/fall-wedding-catering-guide")({
  head: () => ({
    meta: [
      { title: "Fall Wedding Catering Guide — Northeast Ohio | VPS Finest" },
      { name: "description", content: "A calm guide to planning fall wedding catering in Hudson, Aurora, and Northeast Ohio. Seasonal menus, timing, and what to expect from peak wedding season." },
      { property: "og:title", content: "Fall Wedding Catering Guide — Northeast Ohio" },
      { property: "og:description", content: "Planning, menus, and timing for a fall wedding in Northeast Ohio." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: FallGuide,
});

function FallGuide() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <article className="pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-accent mb-5">Fall · Guide</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.15] mb-8">
            Planning a fall wedding in Hudson, Aurora, or the Western Reserve.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            Fall is our busiest season — and it's not a coincidence. The light is warmer, the venues are at their best, and the food is finally ours to play with. Here's an honest look at planning a fall wedding in Northeast Ohio.
          </p>

          <div className="space-y-10 text-foreground">
            <section>
              <h2 className="font-display text-2xl font-bold mb-4">When to start planning</h2>
              <p className="text-muted-foreground leading-relaxed">
                Fall weekends in Hudson, Aurora, and the Western Reserve are the most competitive of the year. Saturdays from mid-September through late October often book nine to twelve months ahead — sometimes more for popular venues. If your date is set, reaching out early is genuinely easier on everyone.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">What's in season</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Fall is the season we have the most to work with. Late tomatoes, sweet peppers, winter squash, apples, pears, root vegetables, hearty greens, mushrooms, grains, braising cuts — the whole range of food that makes the kitchen feel busy in the best way.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We design menus that feel like a real Ohio harvest without leaning on the obvious — no excessive pumpkin spice, no apologetic vegetarian plate, no buffet that exists only because it's expected.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">Service style and venue logistics</h2>
              <p className="text-muted-foreground leading-relaxed">
                Hudson and the Western Reserve have a particular kind of venue — historic homes, barns, estates, restored mills. Each one has its own quirks: how the kitchen is laid out, whether power is reliable, where guests park. We've worked enough of them to know what to ask for and what to plan around. Travel and logistics are itemized in your quote.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">A few menu starting points</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>Butternut squash crostini, baked brie with apple, beef tenderloin on toast, warm cider for arrival.</li>
                <li>Braised short rib with creamy polenta — almost universally beloved.</li>
                <li>Herb-roasted chicken with brown butter farro and roasted root vegetables.</li>
                <li>A wild mushroom and grain plate that holds its own as a vegetarian main, not as a side.</li>
                <li>Apple galette, pumpkin pot de crème, or a small wedding cake with seasonal fruit.</li>
              </ul>
              <p className="text-sm text-muted-foreground italic mt-4">
                Every menu is designed for your day. These are starting points, not a fixed list.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">A note on the season</h2>
              <p className="text-muted-foreground leading-relaxed">
                Fall weddings can feel rushed if you let them — every vendor is busy, every weekend is full. Our job is to take that pressure off the food side of your day. Clear timelines, written confirmations, and quiet, well-rehearsed service so nothing about dinner feels frantic.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-10 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Related:{" "}
              <Link to="/weddings/fall-hudson-ohio" className="text-accent hover:underline">Fall weddings in Hudson, Ohio</Link>
              {" · "}
              <Link to="/weddings/booking-timeline" className="text-accent hover:underline">When to book your caterer</Link>
            </p>
          </div>
        </div>
      </article>

      <SeasonalCTA
        heading="Planning a fall wedding?"
        subhead="Fall weekends fill quickly across Northeast Ohio. Share your date and a few details, and we'll reply with a clear next step."
      />

      <PublicFooter />
    </div>
  );
}
