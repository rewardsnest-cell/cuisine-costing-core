import { Link } from "@tanstack/react-router";

export function SeasonalCTA({ heading, subhead }: { heading: string; subhead: string }) {
  return (
    <section className="py-24 bg-secondary border-t border-border">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-6">When you're ready</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-5">{heading}</h2>
        <p className="text-muted-foreground leading-relaxed text-lg mb-10">{subhead}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
            Start a wedding inquiry
          </Link>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
            Just say hello
          </Link>
        </div>
      </div>
    </section>
  );
}
