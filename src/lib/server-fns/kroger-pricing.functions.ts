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
 *  - Writes only to price_history (source='kroger_api'), kroger_sku_map, and kroger_ingest_runs.
 *  - No simulated/fake data.
 *
 * Phase 3 additions:
 *  - Background queue (kroger_ingest_runs) so the UI can refresh while ingest runs.
 *  - Optional locationId for catering service area pricing.
 *  - SKU mapping confirm/reject + history endpoints + chart series.
 */

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

async function getKv(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_kv").select("value").eq("key", key).maybeSingle();
  return (data as any)?.value ?? null;
}

async function setKv(key: string, value: string, userId: string) {
  await supabaseAdmin.from("app_kv").upsert({
    key,
    value,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
}

async function isKrogerEnabled(): Promise<boolean> {
  const v = await getKv("enable_kroger_ingest");
  return String(v ?? "false").toLowerCase() === "true";
}

async function getKrogerLocationId(): Promise<string | null> {
  const v = await getKv("kroger_location_id");
  return v && v.trim().length > 0 ? v.trim() : null;
}

export const getKrogerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const enabled = await isKrogerEnabled();
    const locationId = await getKrogerLocationId();
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
      location_id: locationId,
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
    await setKv("enable_kroger_ingest", data.enabled ? "true" : "false", context.userId);
    return { ok: true, enabled: data.enabled };
  });

export const setKrogerLocationId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { location_id: string | null }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const v = (data.location_id ?? "").trim();
    if (v && !/^[A-Za-z0-9-]{1,32}$/.test(v)) {
      throw new Error("Invalid locationId format");
    }
    await setKv("kroger_location_id", v, context.userId);
    return { ok: true, location_id: v || null };
  });

/**
 * Kroger OAuth2 client_credentials token exchange.
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
 * Background worker: performs the actual ingest for a queued run row.
 * Returns nothing; updates the run row in place.
 */
async function performIngest(runId: string, opts: { limit: number; locationId: string | null }) {
  const startedAt = new Date().toISOString();
  await supabaseAdmin
    .from("kroger_ingest_runs")
    .update({ status: "running", started_at: startedAt })
    .eq("id", runId);

  const errors: { item: string; error: string }[] = [];
  let priceRowsWritten = 0;
  let skuMapRowsTouched = 0;
  let itemsQueried = 0;
  let message: string | null = null;

  try {
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id,name,unit")
      .order("updated_at", { ascending: true })
      .limit(opts.limit);
    if (itemsErr) throw new Error(itemsErr.message);

    const token = await getKrogerAccessToken();

    for (const item of items ?? []) {
      itemsQueried++;
      try {
        const url = new URL("https://api.kroger.com/v1/products");
        url.searchParams.set("filter.term", item.name);
        url.searchParams.set("filter.limit", "5");
        if (opts.locationId) url.searchParams.set("filter.locationId", opts.locationId);

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

          const { error: mapErr } = await supabaseAdmin.from("kroger_sku_map").upsert(
            {
              sku,
              product_name: productName,
              product_name_normalized: normalizeName(productName),
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "sku" },
          );
          if (!mapErr) skuMapRowsTouched++;

          const noteParts = [
            promo != null ? `promo=${promo}` : null,
            regular != null ? `regular=${regular}` : null,
            opts.locationId ? `loc=${opts.locationId}` : null,
          ].filter(Boolean);

          const { error: phErr } = await supabaseAdmin.from("price_history").insert({
            inventory_item_id: item.id,
            unit_price: observed,
            unit: unit ?? item.unit,
            source: "kroger_api",
            source_id: sku,
            notes: noteParts.join(" "),
          });
          if (phErr) errors.push({ item: item.name, error: phErr.message });
          else priceRowsWritten++;
        }
      } catch (e: any) {
        errors.push({ item: item.name, error: e?.message ?? "unknown" });
      }
    }

    message = `Queried ${itemsQueried}, wrote ${priceRowsWritten} price rows, touched ${skuMapRowsTouched} SKUs.`;

    await supabaseAdmin
      .from("kroger_ingest_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        items_queried: itemsQueried,
        price_rows_written: priceRowsWritten,
        sku_map_rows_touched: skuMapRowsTouched,
        errors: errors.slice(0, 100),
        message,
      })
      .eq("id", runId);

    await supabaseAdmin.from("access_audit_log").insert({
      action: "kroger_ingest_run",
      details: {
        run_id: runId,
        items_queried: itemsQueried,
        price_rows_written: priceRowsWritten,
        sku_map_rows_touched: skuMapRowsTouched,
        location_id: opts.locationId,
        errors: errors.slice(0, 20),
      },
    });
  } catch (e: any) {
    await supabaseAdmin
      .from("kroger_ingest_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        items_queried: itemsQueried,
        price_rows_written: priceRowsWritten,
        sku_map_rows_touched: skuMapRowsTouched,
        errors: [...errors, { item: "_run", error: e?.message ?? "unknown" }].slice(0, 100),
        message: e?.message ?? "Run failed",
      })
      .eq("id", runId);
  }
}

/**
 * Enqueue an ingest run and start it in the background. Returns immediately
 * so the UI can poll for status. The Worker will keep the async work alive
 * while it has pending fetches.
 */
export const ingestKrogerPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);

    const enabled = await isKrogerEnabled();
    if (!enabled) {
      const { data: row } = await supabaseAdmin
        .from("kroger_ingest_runs")
        .insert({
          status: "skipped",
          triggered_by: context.userId,
          finished_at: new Date().toISOString(),
          message: "Kroger ingest is disabled.",
        })
        .select("id")
        .single();
      return { ran: false, run_id: row?.id ?? null, reason: "feature_disabled", message: "Kroger ingest is disabled. Enable it in Admin → Kroger Pricing." };
    }
    if (!process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET) {
      const { data: row } = await supabaseAdmin
        .from("kroger_ingest_runs")
        .insert({
          status: "skipped",
          triggered_by: context.userId,
          finished_at: new Date().toISOString(),
          message: "Kroger API keys are not configured.",
        })
        .select("id")
        .single();
      return { ran: false, run_id: row?.id ?? null, reason: "missing_keys", message: "Kroger API keys are not configured." };
    }

    const limit = Math.max(1, Math.min(50, data.limit ?? 25));
    const locationId = await getKrogerLocationId();

    const { data: runRow, error: insErr } = await supabaseAdmin
      .from("kroger_ingest_runs")
      .insert({
        status: "queued",
        triggered_by: context.userId,
        location_id: locationId,
        item_limit: limit,
      })
      .select("id")
      .single();
    if (insErr || !runRow) throw new Error(insErr?.message ?? "Failed to enqueue run");

    // Fire-and-forget background work. The Worker keeps it alive while pending.
    void performIngest(runRow.id, { limit, locationId });

    return {
      ran: true,
      queued: true,
      run_id: runRow.id,
      message: "Ingest queued. Refresh to track progress.",
    };
  });

export const listKrogerRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("kroger_ingest_runs")
      .select("id,status,triggered_by,started_at,finished_at,items_queried,price_rows_written,sku_map_rows_touched,errors,message,location_id,item_limit,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(100, data.limit ?? 25)));
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getKrogerRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("kroger_ingest_runs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
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
  .inputValidator((d: { status?: string; search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("kroger_sku_map")
      .select("id,sku,product_name,product_name_normalized,status,reference_id,match_confidence,last_seen_at,notes,confirmed_at")
      .order("last_seen_at", { ascending: false })
      .limit(Math.max(1, Math.min(500, data.limit ?? 200)));
    if (data.status) q = q.eq("status", data.status);
    if (data.search && data.search.trim().length > 0) {
      const s = data.search.trim();
      q = q.or(`product_name.ilike.%${s}%,sku.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Hydrate ingredient_reference names for already-linked rows
    const refIds = Array.from(new Set((rows ?? []).map((r) => r.reference_id).filter(Boolean))) as string[];
    let refMap: Record<string, string> = {};
    if (refIds.length > 0) {
      const { data: refs } = await supabaseAdmin
        .from("ingredient_reference")
        .select("id,canonical_name")
        .in("id", refIds);
      refMap = Object.fromEntries((refs ?? []).map((r: any) => [r.id, r.canonical_name]));
    }
    return (rows ?? []).map((r) => ({ ...r, reference_name: r.reference_id ? refMap[r.reference_id] ?? null : null }));
  });

export const searchIngredientReferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search: string; limit?: number }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const s = (data.search ?? "").trim();
    if (s.length < 2) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("ingredient_reference")
      .select("id,canonical_name,default_unit,inventory_item_id")
      .ilike("canonical_name", `%${s}%`)
      .order("canonical_name", { ascending: true })
      .limit(Math.max(1, Math.min(50, data.limit ?? 20)));
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const confirmKrogerSkuMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reference_id: string | null; status: "confirmed" | "rejected" | "unmapped" }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const patch: any = {
      status: data.status,
      reference_id: data.status === "confirmed" ? data.reference_id : null,
    };
    if (data.status === "confirmed") {
      patch.confirmed_by = context.userId;
      patch.confirmed_at = new Date().toISOString();
    } else {
      patch.confirmed_by = null;
      patch.confirmed_at = null;
    }
    const { error } = await supabaseAdmin.from("kroger_sku_map").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("access_audit_log").insert({
      action: "kroger_sku_map_review",
      actor_user_id: context.userId,
      details: { id: data.id, status: data.status, reference_id: data.reference_id },
    });

    return { ok: true };
  });

/**
 * Returns price_history series for a given inventory item, separating Kroger
 * regular vs promo (parsed from notes) vs other sources.
 */
export const getInventoryPriceSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_item_id: string; days?: number }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const days = Math.max(7, Math.min(365, data.days ?? 90));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("price_history")
      .select("observed_at,unit_price,source,notes,unit")
      .eq("inventory_item_id", data.inventory_item_id)
      .gte("observed_at", since)
      .order("observed_at", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => {
      const notes = String(r.notes ?? "");
      const promoMatch = notes.match(/promo=([\d.]+)/);
      const regularMatch = notes.match(/regular=([\d.]+)/);
      return {
        observed_at: r.observed_at,
        unit_price: Number(r.unit_price),
        source: r.source,
        unit: r.unit,
        promo: promoMatch ? Number(promoMatch[1]) : null,
        regular: regularMatch ? Number(regularMatch[1]) : null,
        is_promo: !!promoMatch && (!regularMatch || Number(promoMatch[1]) < Number(regularMatch[1])),
      };
    });
  });

/**
 * Lightweight list of inventory items the admin can pick to chart.
 */
export const listChartableItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("inventory_items")
      .select("id,name,unit,average_cost_per_unit")
      .order("name", { ascending: true })
      .limit(Math.max(1, Math.min(200, data.limit ?? 100)));
    if (data.search && data.search.trim().length > 0) {
      q = q.ilike("name", `%${data.search.trim()}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
