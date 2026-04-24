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
 * Kroger OAuth2 client_credentials token exchange.
 * Uses the production token endpoint with product.compact scope.
 */
async function getKrogerAccessToken(): Promise<string> {
  const id = process.env.KROGER_CLIENT_ID!;
  const secret = process.env.KROGER_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Kroger token response missing access_token");
  return json.access_token;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Live Kroger ingest:
 *  - Reads up to N inventory items needing a signal.
 *  - For each, queries products?filter.term=<name>&filter.limit=5 (no locationId required for product.compact).
 *  - Records the lowest regular price (and promo price if present) into price_history(source='kroger_api').
 *  - Upserts kroger_sku_map rows (status='unmapped' on first sight) for human review.
 *  - NEVER mutates inventory_items.average_cost_per_unit, recipes, or quotes.
 */
export const ingestKrogerPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);

    const enabled = await isKrogerEnabled();
    if (!enabled) {
      return { ran: false, reason: "feature_disabled", message: "Kroger ingest is disabled. Enable it in Admin → Kroger Pricing." };
    }
    if (!process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET) {
      return { ran: false, reason: "missing_keys", message: "Kroger API keys are not configured." };
    }

    const limit = Math.max(1, Math.min(50, data.limit ?? 25));

    // Pick inventory items to look up — prefer those without a recent kroger signal.
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id,name,unit")
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (itemsErr) throw new Error(itemsErr.message);

    let token: string;
    try {
      token = await getKrogerAccessToken();
    } catch (e: any) {
      return { ran: false, reason: "auth_failed", message: e?.message ?? "Token exchange failed" };
    }

    const errors: { item: string; error: string }[] = [];
    let priceRowsWritten = 0;
    let skuMapRowsTouched = 0;
    let itemsQueried = 0;

    for (const item of items ?? []) {
      itemsQueried++;
      try {
        const url = new URL("https://api.kroger.com/v1/products");
        url.searchParams.set("filter.term", item.name);
        url.searchParams.set("filter.limit", "5");
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          errors.push({ item: item.name, error: `HTTP ${res.status}` });
          continue;
        }
        const body = (await res.json()) as { data?: any[] };
        const products = body.data ?? [];
        if (!products.length) continue;

        for (const p of products) {
          const sku: string | undefined = p.productId ?? p.upc;
          const productName: string = p.description ?? p.brand ?? item.name;
          if (!sku) continue;

          const items_arr = Array.isArray(p.items) ? p.items : [];
          let regular: number | null = null;
          let promo: number | null = null;
          let unit: string | null = null;
          for (const it of items_arr) {
            const price = it?.price ?? {};
            if (typeof price.regular === "number") {
              regular = regular == null ? price.regular : Math.min(regular, price.regular);
            }
            if (typeof price.promo === "number" && price.promo > 0) {
              promo = promo == null ? price.promo : Math.min(promo, price.promo);
            }
            if (!unit && typeof it?.size === "string") unit = it.size;
          }
          if (regular == null && promo == null) continue;
          const observed = (promo != null && promo > 0 ? promo : regular)!;

          // Upsert kroger_sku_map (unmapped on first sight)
          const { error: mapErr } = await supabaseAdmin
            .from("kroger_sku_map")
            .upsert(
              {
                sku,
                product_name: productName,
                product_name_normalized: normalizeName(productName),
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "sku" },
            );
          if (!mapErr) skuMapRowsTouched++;

          // Write advisory price_history row (NEVER touches inventory_items.average_cost_per_unit)
          const { error: phErr } = await supabaseAdmin.from("price_history").insert({
            inventory_item_id: item.id,
            unit_price: observed,
            unit: unit ?? item.unit,
            source: "kroger_api",
            source_id: sku,
            notes: promo != null ? `promo=${promo} regular=${regular}` : `regular=${regular}`,
          });
          if (phErr) errors.push({ item: item.name, error: phErr.message });
          else priceRowsWritten++;
        }
      } catch (e: any) {
        errors.push({ item: item.name, error: e?.message ?? "unknown" });
      }
    }

    await supabaseAdmin.from("access_audit_log").insert({
      action: "kroger_ingest_run",
      actor_user_id: context.userId,
      details: { items_queried: itemsQueried, price_rows_written: priceRowsWritten, sku_map_rows_touched: skuMapRowsTouched, errors: errors.slice(0, 20) },
    });

    return {
      ran: true,
      items_queried: itemsQueried,
      price_rows_written: priceRowsWritten,
      sku_map_rows_touched: skuMapRowsTouched,
      errors,
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
