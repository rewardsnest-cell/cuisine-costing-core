import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

/**
 * Affiliate disclosure components used across the app to stay compliant with
 * Amazon Associates Operating Agreement and FTC 16 CFR Part 255.
 *
 * Three variants:
 * - "footer"  → site-wide one-liner shown in PublicFooter
 * - "inline"  → friendly recipe-overlay disclosure shown above any list of
 *               affiliate links (Shop this recipe, etc.)
 * - "tooltip" → small info-icon shown next to a single affiliate link
 *
 * Disclosure copy is intentionally non-removable at the component level;
 * admins cannot turn these off, only choose where they appear.
 */

const BRAND = "VPS Finest";

export function FooterAffiliateDisclosure() {
  return (
    <p className="text-xs text-background/50 text-center leading-relaxed">
      As an Amazon Associate, {BRAND} earns from qualifying purchases.{" "}
      <Link to="/terms" className="underline hover:text-background/80">
        Learn more
      </Link>
      .
    </p>
  );
}

export function InlineAffiliateDisclosure({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      className={`rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground leading-relaxed ${className}`}
    >
      <strong className="font-medium text-foreground">Affiliate links:</strong>{" "}
      This recipe includes affiliate links. Buying through these links helps
      support {BRAND} at no extra cost to you. We only recommend tools we
      genuinely use or trust.
    </div>
  );
}

export function SponsoredLabel({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary ${className}`}
      title="Sponsored by a brand we trust. All opinions are our own."
    >
      Sponsored
    </span>
  );
}

export function AffiliateInfoTooltip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center text-muted-foreground hover:text-foreground ${className}`}
      title="We only recommend tools we genuinely use or trust."
      aria-label="About affiliate links"
    >
      <Info className="w-3.5 h-3.5" />
    </span>
  );
}
