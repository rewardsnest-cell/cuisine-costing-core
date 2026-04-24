import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";

/**
 * Phase One: replaces the old floating round Quote button with a quiet,
 * mobile-only bottom bar offering two text actions. Renders only on the
 * key public surfaces (home, weddings, catering) and only on small screens.
 */
const ALLOWED_PREFIXES = ["/weddings", "/catering"];

export function FloatingQuoteCTA() {
  const [show, setShow] = useState(false);
  const location = useLocation();
  const path = location.pathname;
  const onAllowedRoute = path === "/" || ALLOWED_PREFIXES.some((p) => path.startsWith(p));

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!onAllowedRoute) return null;

  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md transition-transform duration-300 ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="grid grid-cols-2 divide-x divide-border text-sm">
        <Link
          to="/weddings"
          className="py-3 text-center font-medium text-foreground hover:bg-muted transition-colors"
        >
          Weddings
        </Link>
        <Link
          to="/catering/quote"
          className="py-3 text-center font-semibold text-primary hover:bg-muted transition-colors"
        >
          Get a quote
        </Link>
      </div>
    </div>
  );
}
