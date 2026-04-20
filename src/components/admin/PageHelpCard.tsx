import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Info, X, ArrowRight } from "lucide-react";
import { getPageHelp, type PageHelp } from "@/lib/admin/page-help";

interface PageHelpCardProps {
  /** Route key matching an entry in page-help registry, e.g. "/admin/national-prices" */
  route: string;
  /** Optional override if you don't want to register copy centrally */
  help?: PageHelp;
}

/**
 * Calm, sage-accent help card displayed at the top of each admin page.
 * Tells the admin what the page is for, when to use it, and links to related pages.
 * Dismissible per-route via localStorage.
 */
export function PageHelpCard({ route, help }: PageHelpCardProps) {
  const data = help ?? getPageHelp(route);
  const storageKey = `admin-help-hidden:${route}`;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (!data || hidden) return null;

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
    setHidden(true);
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6 relative">
      <button
        onClick={dismiss}
        aria-label="Hide help"
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex gap-3">
        <div className="shrink-0 mt-0.5">
          <Info className="w-4 h-4 text-primary" />
        </div>
        <div className="space-y-2 text-sm pr-6">
          <div>
            <p className="font-medium text-foreground">{data.title}</p>
            <p className="text-muted-foreground mt-0.5">{data.purpose}</p>
          </div>
          {data.whenToUse && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">When to use: </span>
              {data.whenToUse}
            </p>
          )}
          {data.related && data.related.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {data.related.map((r) => (
                <Link
                  key={r.to}
                  to={r.to}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  {r.label}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
