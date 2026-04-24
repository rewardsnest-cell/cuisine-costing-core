import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const INSPIRED_PHASES = ["off", "admin_preview", "soft_launch", "public"] as const;
export type InspiredPhase = (typeof INSPIRED_PHASES)[number];

export const PHASE_LABEL: Record<InspiredPhase, string> = {
  off: "Off (hidden)",
  admin_preview: "Admin preview",
  soft_launch: "Soft launch (URL only)",
  public: "Public",
};

export const PHASE_DESCRIPTION: Record<InspiredPhase, string> = {
  off: "Hidden everywhere.",
  admin_preview: "Visible only to admins on the Familiar Favorites preview page.",
  soft_launch: "Reachable by direct URL only — not in nav or index.",
  public: "Visible on /familiar-favorites and counts toward nav visibility.",
};

export const PHASE_BADGE_CLASS: Record<InspiredPhase, string> = {
  off: "bg-muted text-muted-foreground",
  admin_preview: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  soft_launch: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  public: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

/**
 * Reads the public feature_visibility row that gates whether the Familiar
 * Favorites link appears in the public nav, and also confirms ≥1 recipe is in
 * `public` phase. Both must be true for the nav link to render.
 *
 * Note: internal recipe column is still `inspired` / `inspired_phase` for
 * backward compatibility — only the public label and feature_key are renamed.
 */
export function useInspiredNavVisible() {
  const [navEnabled, setNavEnabled] = useState<boolean | null>(null);
  const [hasPublic, setHasPublic] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: vis }, { count }] = await Promise.all([
        (supabase as any)
          .from("feature_visibility")
          .select("phase, nav_enabled")
          .eq("feature_key", "familiar_favorites")
          .maybeSingle(),
        (supabase as any)
          .from("recipes")
          .select("id", { count: "exact", head: true })
          .eq("inspired", true)
          .eq("inspired_phase", "public")
          .eq("status", "published")
          .eq("active", true),
      ]);
      if (cancelled) return;
      setNavEnabled(!!vis && vis.phase === "public" && !!vis.nav_enabled);
      setHasPublic((count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    visible: !!navEnabled && !!hasPublic,
    navEnabled,
    hasPublic,
    loading: navEnabled === null || hasPublic === null,
  };
}
