import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { SeasonalCTA } from "@/components/SeasonalCTA";
import { articleJsonLd, SITE_URL } from "@/lib/seo/jsonld";

const TITLE = "Spring Wedding Catering Guide — Northeast Ohio | VPS Finest";
const DESC = "A calm guide to planning spring wedding catering in Aurora, Ohio and Northeast Ohio. Seasonal menus, weather, timing, and what to expect.";
const URL = `${SITE_URL}/blog/spring-wedding-catering-guide`;

export const Route = createFileRoute("/blog/spring-wedding-catering-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: "Spring Wedding Catering Guide — Northeast Ohio" },
      { property: "og:description", content: "Seasonal planning, menus, and timing for a spring wedding in Northeast Ohio." },
      { property: "og:type", content: "article" },
    ],
    scripts: [articleJsonLd({ title: TITLE, description: DESC, url: URL })],
  }),
  component: SpringGuide,
});

function SpringGuide() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <article className="pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-accent mb-5">Spring · Guide</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.15] mb-8">
            A calm guide to planning a spring wedding in Northeast Ohio.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            Spring weddings in Aurora, Hudson, and the surrounding area have a particular kind of beauty — gentle light, the first real green of the year, and a sense that everything is just beginning. Here's how we think about catering them.
          </p>

          <div className="space-y-10 text-foreground">
            <section>
              <h2 className="font-display text-2xl font-bold mb-4">When to start planning</h2>
              <p className="text-muted-foreground leading-relaxed">
                Most spring couples reach out between nine and twelve months ahead — often the previous summer or early fall. April and May Saturdays book up first. If you're earlier in your planning, you have plenty of room to take your time. If you're later, please still ask; we may have an opening.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">What's actually in season</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Spring in Northeast Ohio comes in waves. Early spring (March, early April) is still mostly storage produce — root vegetables, apples, last year's grains. Late April and May bring the first real harvest: asparagus, peas, ramps, fresh herbs, early greens, rhubarb, and finally strawberries.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We design menus around what's genuinely available the week of your wedding, not a generic seasonal template. That usually means lighter dishes than fall or winter, but still warm and substantial — a cool spring evening in Ohio can call for soup just as easily as salad.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">Planning around the weather</h2>
              <p className="text-muted-foreground leading-relaxed">
                Spring weather in Northeast Ohio is real spring weather — beautiful, then suddenly forty degrees and raining. We plan for both. That means warm passed bites at cocktail hour, an indoor backup for plating and service, and a kitchen setup that doesn't depend on tents staying dry. The goal is a day that feels effortless regardless of what the sky decides to do.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">A few menu starting points</h2>
              <ul className="space-y-3 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>Spring pea and ricotta crostini, or warm goat cheese with honey for cocktail hour.</li>
                <li>Roasted spring chicken with herbs, lemon, and new potatoes — simple, generous, beloved.</li>
                <li>Pan-seared trout with asparagus and brown butter for a lighter main.</li>
                <li>A vegetable-forward plate built around the market that week, designed to feel like a real dish, not an apology.</li>
                <li>Strawberry-rhubarb tart, lemon olive oil cake, or a small wedding cake with seasonal fruit.</li>
              </ul>
              <p className="text-sm text-muted-foreground italic mt-4">
                Every menu is designed for your day. These are starting points, not a fixed list.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold mb-4">A note on pace</h2>
              <p className="text-muted-foreground leading-relaxed">
                Spring weddings often feel quieter than fall ones — fewer guests, smaller venues, more attention to the dinner itself. We like that. It lets us cook food that means something rather than food that just feeds a crowd.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-10 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Related:{" "}
              <Link to="/weddings/spring-aurora-ohio" className="text-accent hover:underline">Spring weddings in Aurora, Ohio</Link>
              {" · "}
              <Link to="/weddings/booking-timeline" className="text-accent hover:underline">When to book your caterer</Link>
            </p>
          </div>
        </div>
      </article>

      <SeasonalCTA
        heading="Planning a spring wedding?"
        subhead="Tell us a bit about your day and we'll come back with a clear, itemized quote."
      />

      <PublicFooter />
    </div>
  );
}
