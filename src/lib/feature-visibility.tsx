import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const VISIBILITY_PHASES = ["off", "admin_preview", "soft_launch", "public"] as const;
export type VisibilityPhase = (typeof VISIBILITY_PHASES)[number];

export const PHASE_LABEL: Record<VisibilityPhase, string> = {
  off: "Off (hidden)",
  admin_preview: "Admin preview",
  soft_launch: "Soft launch (URL only)",
  public: "Public",
};

export const PHASE_DESCRIPTION: Record<VisibilityPhase, string> = {
  off: "Hidden everywhere. Returns 404-equivalent for everyone.",
  admin_preview: "Visible only to signed-in admins.",
  soft_launch: "Reachable by direct URL. Hidden from nav. Always noindex.",
  public: "Visible to everyone. Nav and SEO follow their own toggles.",
};

export const PHASE_BADGE_CLASS: Record<VisibilityPhase, string> = {
  off: "bg-muted text-muted-foreground",
  admin_preview: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  soft_launch: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  public: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export type FeatureKey =
  | "familiar_favorites"
  | "inspired" // legacy alias, kept for backward compatibility — prefer familiar_favorites
  | "recipes"
  | "guides"
  | "menu"
  | "catering"
  | "blog"
  | "weddings"
  | "quote"
  | "follow"
  | "lookup"
  | "coupon"
  | "cooking_lab";

export type FeatureVisibility = {
  feature_key: string;
  phase: VisibilityPhase;
  nav_enabled: boolean;
  seo_indexing_enabled: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

const subscribers = new Set<() => void>();
let sharedMap: Map<string, FeatureVisibility> | null = null;
let sharedLoading = true;
let sharedError: string | null = null;
let inFlight: Promise<void> | null = null;

function notifySubscribers() {
  for (const subscriber of subscribers) subscriber();
}

function buildVisibilityMap(rows: FeatureVisibility[]) {
  const map = new Map<string, FeatureVisibility>();
  for (const row of rows) {
    map.set(row.feature_key, row);
  }
  return map;
}

async function fetchFeatureVisibilityRegistry() {
  if (inFlight) return inFlight;

  sharedLoading = true;
  notifySubscribers();

  inFlight = (async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("feature_visibility")
        .select("feature_key, phase, nav_enabled, seo_indexing_enabled, notes, updated_by, updated_at");
      if (error) throw error;

      sharedMap = buildVisibilityMap((data ?? []) as FeatureVisibility[]);
      sharedError = null;
    } catch (e: any) {
      sharedError = e?.message ?? "Failed to load feature visibility";
    } finally {
      sharedLoading = false;
      inFlight = null;
      notifySubscribers();
    }
  })();

  return inFlight;
}

export function syncFeatureVisibilityRows(rows: FeatureVisibility[]) {
  sharedMap = buildVisibilityMap(rows);
  sharedLoading = false;
  sharedError = null;
  notifySubscribers();
}

/**
 * Subscribe to the entire registry. Returns a Map keyed by feature_key.
 * Safe to call from many components — Supabase coalesces requests.
 */
export function useFeatureVisibilityMap() {
  const [map, setMap] = useState<Map<string, FeatureVisibility> | null>(sharedMap);
  const [loading, setLoading] = useState(sharedLoading);
  const [error, setError] = useState<string | null>(sharedError);

  const refetch = useCallback(async () => {
    await fetchFeatureVisibilityRegistry();
  }, []);

  useEffect(() => {
    const syncFromStore = () => {
      setMap(sharedMap);
      setLoading(sharedLoading);
      setError(sharedError);
    };

    subscribers.add(syncFromStore);
    syncFromStore();

    if (sharedMap === null && sharedLoading) {
      void fetchFeatureVisibilityRegistry();
    }

    return () => {
      subscribers.delete(syncFromStore);
    };
  }, [refetch]);

  return { map, loading, error, refetch };
}

/**
 * Read a single feature's visibility. Safe-by-default: while loading we treat
 * the page as visible to avoid a flash of 404. The guard component handles
 * actual enforcement once data arrives.
 */
export function useFeatureVisibility(key: FeatureKey | string) {
  const { map, loading, error, refetch } = useFeatureVisibilityMap();
  const row = map?.get(key) ?? null;
  return { row, loading, error, refetch };
}

/**
 * Decide what should happen for a viewer at the current phase.
 * - 'render' — show the page
 * - 'admin_only' — admin sees it; everyone else should be redirected
 * - 'redirect' — redirect everyone (off / loading-error fallback)
 */
export function decideVisibility(
  row: FeatureVisibility | null | undefined,
  isAdmin: boolean,
): "render" | "admin_only" | "redirect" {
  // No row yet (still loading or feature unregistered) → render to avoid flash.
  if (!row) return "render";
  switch (row.phase) {
    case "public":
    case "soft_launch":
      return "render";
    case "admin_preview":
      return isAdmin ? "render" : "redirect";
    case "off":
      return isAdmin ? "admin_only" : "redirect";
  }
}

/**
 * Hook used by route components: returns whether to render, and triggers a
 * client-side redirect-with-toast when the feature is gated.
 *
 * Until the registry has loaded, returns { ready: false } so the route can
 * show a loading state instead of flashing protected content.
 */
export function useFeatureGate(key: FeatureKey | string, opts?: { label?: string }) {
  const { isAdmin } = useAuth();
  const { row, loading } = useFeatureVisibility(key);
  const navigate = useNavigate();
  const [redirected, setRedirected] = useState(false);

  const decision = decideVisibility(row, !!isAdmin);

  useEffect(() => {
    if (loading || redirected) return;
    if (decision === "redirect") {
      setRedirected(true);
      toast.message(`${opts?.label ?? "This page"} isn't available right now.`);
      void navigate({ to: "/" });
    }
  }, [loading, decision, redirected, navigate, opts?.label]);

  return {
    ready: !loading,
    allowed: decision === "render" || decision === "admin_only",
    isAdminPreview: decision === "admin_only" || (row?.phase === "admin_preview" && isAdmin),
    isSoftLaunch: row?.phase === "soft_launch",
    seoIndexingEnabled: row?.seo_indexing_enabled ?? true,
    phase: row?.phase ?? null,
    row,
  };
}

/**
 * Returns nav links that should appear in the public header — i.e. features
 * with phase=public AND nav_enabled=true. Unregistered keys default to true
 * so always-on routes (Home, About, Contact) are unaffected.
 */
export function isNavLinkVisible(
  map: Map<string, FeatureVisibility> | null,
  key: FeatureKey | string,
): boolean {
  if (!map) return true;
  const row = map.get(key);
  if (!row) return true;
  return row.phase === "public" && row.nav_enabled;
}
