import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PRICING_VISIBILITY_KEY = "hide_public_pricing";

/**
 * Reads the admin-controlled toggle from `app_kv` that hides ALL pricing on
 * public pages (menu, recipes list, selection tray, etc.). Admin verification
 * pages always show pricing regardless of this flag.
 */
export function usePricingVisibility() {
  const query = useQuery({
    queryKey: ["app_kv", PRICING_VISIBILITY_KEY],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_kv")
        .select("value")
        .eq("key", PRICING_VISIBILITY_KEY)
        .maybeSingle();
      // Default: HIDE pricing on public pages unless admin has explicitly set
      // the flag to "false" (i.e. opted in to showing prices). This keeps cost
      // figures off the live site by default and makes the admin toggle the
      // single source of truth for revealing them.
      return data?.value !== "false";
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    hidePricing: query.data ?? true,
    showPricing: !(query.data ?? true),
    loading: query.isLoading,
  };
}
