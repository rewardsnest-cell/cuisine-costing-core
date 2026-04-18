import { createFileRoute, Link } from "@tanstack/react-router";
export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Wedding Catering Guides — VPS Finest" },
      { name: "description", content: "Calm, honest guides to wedding catering in Northeast Ohio — seasonal planning, menu ideas, and timing." },
      { property: "og:title", content: "Wedding Catering Guides — VPS Finest" },
      { property: "og:description", content: "Seasonal wedding catering guides for couples planning in Aurora, Hudson, and the Cleveland area." },
    ],
  }),
  component: BlogIndex,
});

const POSTS = [
  {
    to: "/blog/spring-wedding-catering-guide" as const,
    season: "Spring",
    t: "A calm guide to planning a spring wedding in Northeast Ohio",
    d: "What's in season, what to expect from the weather, and how to design a menu that feels like spring without trying too hard.",
  },
  {
    to: "/blog/fall-wedding-catering-guide" as const,
    season: "Fall",
    t: "Planning a fall wedding in Hudson, Aurora, or the Western Reserve",
    d: "Fall is our busiest season. Here's what we tell couples about timing, menus, and the rhythm of a Northeast Ohio harvest wedding.",
  },
  {
    to: "/blog/winter-wedding-catering-guide" as const,
    season: "Winter",
    t: "Why winter weddings around Cleveland are quietly underrated",
    d: "Smaller guest counts, more intimate venues, and the food we most love to cook. A guide to planning a winter wedding without the rush.",
  },
];

function BlogIndex() {
  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-16 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Guides</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.1] mb-6">
            Wedding catering, season by season.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A small library of honest, calm guides for couples planning a wedding in Aurora, Hudson, Cleveland, and the rest of Northeast Ohio.
          </p>
        </div>
      </section>

      <section className="py-16 bg-background border-t border-border">
        <div className="max-w-4xl mx-auto px-6 grid gap-10">
          {POSTS.map((p) => (
            <Link key={p.to} to={p.to} className="group block border-b border-border pb-10 last:border-0">
              <p className="text-xs tracking-[0.25em] uppercase text-accent mb-3">{p.season}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-3 group-hover:underline">{p.t}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.d}</p>
              <p className="mt-4 text-xs tracking-[0.2em] uppercase text-accent">Read the guide →</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
