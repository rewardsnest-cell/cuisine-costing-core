import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandAssetType = "primary_logo" | "light_logo" | "dark_logo" | "favicon";

/**
 * Fetches the active asset URL for a given brand asset type.
 * Cached for 30 minutes to avoid re-fetches; the image itself is then
 * cached by the browser/CDN. Returns `null` when no active row exists,
 * so callers can fall back to a bundled asset.
 */
export function useBrandAsset(type: BrandAssetType) {
  return useQuery({
    queryKey: ["brand-asset", type],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("brand_assets")
        .select("asset_url")
        .eq("asset_type", type)
        .eq("active", true)
        .maybeSingle();
      if (error) return null;
      return data?.asset_url ?? null;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
