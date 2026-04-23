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
      return data?.value === "true";
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    hidePricing: query.data ?? false,
    showPricing: !(query.data ?? false),
    loading: query.isLoading,
  };
}
