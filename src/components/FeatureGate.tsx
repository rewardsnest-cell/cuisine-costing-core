import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LoadingState } from "@/components/LoadingState";
import { useFeatureGate, PHASE_LABEL, type FeatureKey } from "@/lib/feature-visibility";

type Props = {
  featureKey: FeatureKey | string;
  /** Human-readable label for redirect toasts. */
  label?: string;
  children: ReactNode;
};

/**
 * Wrap any public route content with this. It:
 *  - Shows a small loading state until the visibility registry is fetched.
 *  - Renders nothing (and triggers a redirect toast) if the viewer isn't
 *    allowed to see the page at the current phase.
 *  - Renders an "ADMIN PREVIEW — NOT PUBLIC" or "SOFT LAUNCH" banner above
 *    children when applicable.
 *
 * Phase rules (gate the whole feature group, per spec answer):
 *  - off            → redirect everyone home (admins see admin-preview banner)
 *  - admin_preview  → admins only; others redirect home
 *  - soft_launch    → render for everyone; banner says "Soft launch — URL only"
 *  - public         → render normally
 */
export function FeatureGate({ featureKey, label, children }: Props) {
  const gate = useFeatureGate(featureKey, { label });

  if (!gate.ready) {
    return <LoadingState fullScreen label="Loading…" />;
  }

  if (!gate.allowed) {
    // Redirect already triggered inside the hook.
    return null;
  }

  return (
    <>
      {(gate.isAdminPreview || gate.phase === "off") && (
        <PhaseBanner
          tone="amber"
          title="ADMIN PREVIEW — NOT PUBLIC"
          subtitle={`Phase: ${PHASE_LABEL[gate.phase ?? "off"]}. Only admins can see this page.`}
        />
      )}
      {gate.isSoftLaunch && (
        <PhaseBanner
          tone="blue"
          title="SOFT LAUNCH — URL ONLY"
          subtitle="This page is reachable by direct URL but is hidden from navigation and search engines."
        />
      )}
      {children}
    </>
  );
}

function PhaseBanner({
  tone,
  title,
  subtitle,
}: {
  tone: "amber" | "blue";
  title: string;
  subtitle: string;
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
  return (
    <div
      className={`fixed top-16 left-0 right-0 z-40 border-b ${cls}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4 text-xs">
        <div className="min-w-0">
          <span className="font-semibold tracking-wider uppercase">{title}</span>
          <span className="ml-2 opacity-80">{subtitle}</span>
        </div>
        <Link to="/admin/visibility" className="underline whitespace-nowrap font-medium">
          Manage visibility →
        </Link>
      </div>
    </div>
  );
}

/**
 * Inject `<meta name="robots" content="noindex,nofollow">` for routes whose
 * feature has SEO indexing disabled OR is in soft_launch / admin_preview / off.
 *
 * Use inside route head() factories like:
 *   head: () => ({ meta: [...maybeNoindexMeta(...)], links: [...] })
 *
 * Because head() runs at route definition time on the client too, this helper
 * is intentionally synchronous and conservative: callers pass a static decision
 * computed elsewhere (the FeatureGate handles runtime SEO via a separate hook).
 */
export function NoindexMeta({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      {/* These meta tags are injected via React rendering into <head> by
          TanStack Router's HeadContent during SSR + hydration when placed
          inside route head() — but for runtime visibility we render a Helmet-
          style element directly. Browsers honor robots meta wherever it lives
          in the document. */}
      <meta name="robots" content="noindex,nofollow" />
    </>
  );
}
