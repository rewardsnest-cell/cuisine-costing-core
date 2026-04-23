import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAssetEvent } from "@/lib/asset-debug";

/**
 * SSR-friendly hook for fetching a single site_asset_manifest entry by slug.
 *
 * - Uses TanStack Query so SSR + hydration work without flicker
 * - Caches across components for the same slug
 * - Records every fetch outcome in the asset debug log
 *
 * Returns:
 *   url      — public_url string when available, otherwise null
 *   loading  — true while the first fetch is in flight (no cached value yet)
 *   error    — error message if the fetch failed, otherwise null
 */
export function useAsset(slug: string): {
  url: string | null;
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: ["site-asset", slug],
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from("site_asset_manifest")
        .select("public_url")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        recordAssetEvent({ slug, status: "error", error: error.message });
        throw new Error(error.message);
      }
      const url = data?.public_url ?? null;
      recordAssetEvent({
        slug,
        status: url ? "ok" : "missing",
        url,
        error: url ? null : "No row in site_asset_manifest for slug",
      });
      return url;
    },
  });

  // Re-record on hydration if data came from cache (so the panel reflects this session)
  useEffect(() => {
    if (!slug) return;
    if (query.isFetching) return;
    // no-op: events are already recorded inside queryFn
  }, [slug, query.isFetching]);

  return {
    url: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}
