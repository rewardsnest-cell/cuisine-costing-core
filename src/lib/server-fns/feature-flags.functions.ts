import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Feature flags stored in app_kv as boolean strings ("true"/"false").
 * Free tier: canonical ingredients, local cost tracking (always on).
 * Paid tier: national pricing floor, margin reports, volatility alerts (gated).
 */
export const FEATURE_FLAGS = [
  "national_pricing_enabled",
  "margin_reporting_enabled",
  "volatility_alerts_enabled",
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const getFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data } = await sb
      .from("app_kv")
      .select("key,value")
      .in("key", FEATURE_FLAGS as unknown as string[]);
    const out: Record<FeatureFlag, boolean> = {
      national_pricing_enabled: false,
      margin_reporting_enabled: false,
      volatility_alerts_enabled: false,
    };
    for (const r of data ?? []) {
      if ((FEATURE_FLAGS as readonly string[]).includes(r.key)) {
        out[r.key as FeatureFlag] = String(r.value).toLowerCase() === "true";
      }
    }
    return out;
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flag: FeatureFlag; enabled: boolean }) => {
    if (!(FEATURE_FLAGS as readonly string[]).includes(input.flag)) {
      throw new Error("Unknown feature flag");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("app_kv")
      .upsert({ key: data.flag, value: data.enabled ? "true" : "false" });
    if (error) throw error;
    return { ok: true };
  });
