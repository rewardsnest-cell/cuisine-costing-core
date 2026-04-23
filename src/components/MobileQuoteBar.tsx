import { Link } from "@tanstack/react-router";

/**
 * Mobile-only sticky bottom bar with the two highest-intent CTAs.
 * Hidden on md+ (desktop has the sticky header CTA instead).
 */
export function MobileQuoteBar() {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)] pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-2 gap-2 p-2">
        <Link
          to="/weddings"
          className="inline-flex items-center justify-center rounded-md border border-foreground/20 bg-background px-3 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
        >
          Wedding inquiry
        </Link>
        <Link
          to="/catering/quote"
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Event quote
        </Link>
      </div>
    </div>
  );
}
