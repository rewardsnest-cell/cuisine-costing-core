import { Link } from "@tanstack/react-router";

type Season = "spring" | "fall" | "winter" | "summer";

interface Props {
  heading: string;
  subhead: string;
  /** Optional season hint stored in sessionStorage and read by /quote for menu defaults. */
  season?: Season;
  /** Optional location label appended to the hint (e.g. "Hudson, Ohio"). */
  location?: string;
}

function setHint(season?: Season, location?: string) {
  if (typeof window === "undefined" || !season) return;
  try {
    sessionStorage.setItem(
      "quote_prefill",
      JSON.stringify({ season, location: location || null, source: "wedding_page", at: Date.now() }),
    );
  } catch {}
}

export function SeasonalCTA({ heading, subhead, season, location }: Props) {
  return (
    <section className="py-24 bg-secondary border-t border-border">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">When you're ready</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-5">{heading}</h2>
        <p className="text-muted-foreground leading-relaxed text-lg mb-10">{subhead}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            to="/catering/quote"
            onClick={() => setHint(season, location)}
            className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {season ? `Start a ${season} wedding inquiry` : "Start a wedding inquiry"}
          </Link>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
            Just say hello
          </Link>
        </div>
      </div>
    </section>
  );
}
