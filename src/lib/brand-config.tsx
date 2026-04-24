import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandConfig = {
  brand_name: string;
  brand_display_name: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
};

const DEFAULTS: BrandConfig = {
  brand_name: "VPSFinest",
  brand_display_name: "VPS Finest",
  primary_color: null,
  secondary_color: null,
  accent_color: null,
  background_color: null,
  text_color: null,
};

const BrandConfigContext = createContext<BrandConfig>(DEFAULTS);

/**
 * Maps brand_config color fields to CSS custom properties on :root.
 * Values may be any valid CSS color (hex, oklch(...), rgb(...), etc.) — we
 * pass them through verbatim so the design tokens in styles.css remain the
 * source of typography/radius defaults while colors become admin-managed.
 */
const COLOR_TOKEN_MAP: Array<[keyof BrandConfig, string]> = [
  ["primary_color", "--primary"],
  ["secondary_color", "--secondary"],
  ["accent_color", "--accent"],
  ["background_color", "--background"],
  ["text_color", "--foreground"],
];

export function BrandConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["brand-config"],
    queryFn: async (): Promise<BrandConfig> => {
      const { data, error } = await supabase
        .from("brand_config")
        .select("brand_name, brand_display_name, primary_color, secondary_color, accent_color, background_color, text_color")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) return DEFAULTS;
      return { ...DEFAULTS, ...data };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const config = useMemo<BrandConfig>(() => data ?? DEFAULTS, [data]);

  // Apply color overrides to :root so the entire app picks them up via the
  // existing semantic tokens (--primary, --background, etc.).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [field, cssVar] of COLOR_TOKEN_MAP) {
      const value = config[field] as string | null;
      if (value && value.trim()) {
        root.style.setProperty(cssVar, value.trim());
      } else {
        root.style.removeProperty(cssVar);
      }
    }
  }, [config]);

  return <BrandConfigContext.Provider value={config}>{children}</BrandConfigContext.Provider>;
}

export function useBrandConfig(): BrandConfig {
  return useContext(BrandConfigContext);
}

export function useBrandName() {
  const c = useContext(BrandConfigContext);
  return { name: c.brand_name, display: c.brand_display_name };
}
