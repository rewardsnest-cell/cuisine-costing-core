import { Link } from "@tanstack/react-router";
import { Heart, Users } from "lucide-react";

interface Props {
  weddingImg: string;
  eventImg: string;
}

/**
 * Couples vs. Hosts — two clear doors directly under the hero so visitors
 * self-segment in seconds. This is the most important conversion block
 * on the homepage.
 */
export function TwoDoors({ weddingImg, eventImg }: Props) {
  return (
    <section className="py-20 bg-background border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">
          Where to start
        </p>
        <h2 className="text-center font-display text-3xl sm:text-4xl font-bold text-foreground mb-12">
          Two calm paths.
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Link
            to="/weddings"
            className="group block rounded-md overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow"
          >
            <div className="relative aspect-[4/3] bg-muted overflow-hidden">
              <img
                src={weddingImg}
                alt="Wedding catering in Aurora, Ohio"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-background/95 bg-foreground/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                <Heart className="w-3 h-3" /> Couples
              </div>
              <div className="absolute bottom-5 left-5 right-5 text-background">
                <h3 className="font-display text-2xl sm:text-3xl font-bold mb-1">Planning a wedding?</h3>
                <p className="text-sm text-background/85 font-light">Plated, family-style, or buffet — tasting included.</p>
              </div>
            </div>
            <div className="p-5 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Aurora, Hudson, Cleveland & all NE Ohio</span>
              <span className="text-sm font-semibold text-primary group-hover:underline">Start an inquiry →</span>
            </div>
          </Link>

          <Link
            to="/catering"
            className="group block rounded-md overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow"
          >
            <div className="relative aspect-[4/3] bg-muted overflow-hidden">
              <img
                src={eventImg}
                alt="Event and private catering in Northeast Ohio"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-background/95 bg-foreground/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                <Users className="w-3 h-3" /> Hosts & teams
              </div>
              <div className="absolute bottom-5 left-5 right-5 text-background">
                <h3 className="font-display text-2xl sm:text-3xl font-bold mb-1">Hosting an event?</h3>
                <p className="text-sm text-background/85 font-light">Corporate lunches, parties, showers, private dinners.</p>
              </div>
            </div>
            <div className="p-5 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Itemized quotes · No surprises</span>
              <span className="text-sm font-semibold text-primary group-hover:underline">Get a quote →</span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
