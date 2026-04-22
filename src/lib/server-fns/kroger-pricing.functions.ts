import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Phase 2 — Kroger Retail Price Integration (Signal-Only)
 *
 * SAFETY GUARANTEES:
 *  - Disabled by default via app_kv flag `enable_kroger_ingest`.
 *  - Exits early when API keys are missing.
 *  - NEVER mutates inventory_items.average_cost_per_unit, recipes, or quotes.
 *  - Writes only to price_history (source='kroger_api') and kroger_sku_map.
 *  - No simulated/fake data.
 */

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

async function isKrogerEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("app_kv")
    .select("value")
    .eq("key", "enable_kroger_ingest")
    .maybeSingle();
  return String((data as any)?.value ?? "false").toLowerCase() === "true";
}

export const getKrogerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const enabled = await isKrogerEnabled();
    const hasClientId = !!process.env.KROGER_CLIENT_ID;
    const hasClientSecret = !!process.env.KROGER_CLIENT_SECRET;

    const { count: mappedCount } = await supabaseAdmin
      .from("kroger_sku_map")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");

    const { count: unmappedCount } = await supabaseAdmin
      .from("kroger_sku_map")
      .select("*", { count: "exact", head: true })
      .eq("status", "unmapped");

    const { count: priceRows } = await supabaseAdmin
      .from("price_history")
      .select("*", { count: "exact", head: true })
      .eq("source", "kroger_api");

    return {
      enabled,
      keys_configured: hasClientId && hasClientSecret,
      missing_keys: [
        ...(!hasClientId ? ["KROGER_CLIENT_ID"] : []),
        ...(!hasClientSecret ? ["KROGER_CLIENT_SECRET"] : []),
      ],
      mapped_skus: mappedCount ?? 0,
      unmapped_skus: unmappedCount ?? 0,
      price_history_rows: priceRows ?? 0,
    };
  });

export const setKrogerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("app_kv")
      .upsert({
        key: "enable_kroger_ingest",
        value: data.enabled ? "true" : "false",
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });

/**
 * Placeholder ingest. Safe to call at any time:
 *  - Exits early if flag is off or keys are missing.
 *  - Performs no writes, no fetches, no simulation.
 *  - Real implementation will: token exchange, product search, normalize units,
 *    capture promo flags, write rows to price_history with source='kroger_api'.
 */
export const ingestKrogerPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);

    const enabled = await isKrogerEnabled();
    if (!enabled) {
      return {
        ran: false,
        reason: "feature_disabled",
        message: "Kroger ingest is disabled. Enable it in Admin → Kroger Pricing.",
      };
    }
    if (!process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET) {
      return {
        ran: false,
        reason: "missing_keys",
        message: "Kroger API keys are not configured. Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.",
      };
    }

    // Real ingest pipeline lives here once keys are provided. We deliberately
    // do nothing today — Phase 2 is signal-only scaffolding.
    return {
      ran: false,
      reason: "not_implemented",
      message:
        "Kroger ingest is enabled and keys are present, but the live fetch pipeline is not yet implemented. No data was written.",
    };
  });

export const getKrogerSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin.rpc("kroger_price_signals");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      inventory_item_id: string;
      inventory_name: string;
      inventory_unit: string;
      inventory_avg: number;
      inventory_last_update: string;
      kroger_30d_median: number | null;
      kroger_sample_count: number;
      kroger_last_observed: string | null;
      flag: "no_signal" | "ok" | "inventory_cheap" | "inventory_expensive" | "stale_inventory";
    }>;
  });

export const listKrogerSkuMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; limit?: number }) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("kroger_sku_map")
      .select("id,sku,product_name,status,reference_id,match_confidence,last_seen_at,notes")
      .order("last_seen_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const confirmKrogerSkuMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reference_id: string | null; status: "confirmed" | "rejected" }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("kroger_sku_map")
      .update({
        reference_id: data.status === "confirmed" ? data.reference_id : null,
        status: data.status,
        confirmed_by: context.userId,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
