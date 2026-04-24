import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron-callable Kroger ingest. Mirrors the public `runKrogerIngest` server fn
 * but skips the auth middleware (the cron route validates the bearer token
 * before calling this).
 *
 * Inlines the same OAuth + locationId resolution + per-unit normalization
 * logic as the admin path. Kept in `src/lib/server/` so it only ships in
 * the server bundle.
 */

const DEFAULT_ZIP = "44202";

async function getKv(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_kv").select("value").eq("key", key).maybeSingle();
  return (data as any)?.value ?? null;
}

async function getSavedLocationId(): Promise<string | null> {
  const v = await getKv("kroger_location_id");
  return v && v.trim().length > 0 ? v.trim() : null;
}

async function krogerFetchWithBackoff(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if ((res.status === 429 || res.status === 503) && attempt < 3) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30000)
      : Math.min(500 * Math.pow(2, attempt), 8000);
    await new Promise((r) => setTimeout(r, waitMs));
    return krogerFetchWithBackoff(url, init, attempt + 1);
  }
  return res;
}

async function getToken(): Promise<string> {
  const id = process.env.KROGER_CLIENT_ID!;
  const secret = process.env.KROGER_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await krogerFetchWithBackoff("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) throw new Error(`OAuth failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Token response missing access_token");
  return json.access_token;
}

async function resolveLocationFromZip(zip: string, token: string): Promise<string | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const cacheKey = `kroger_location_for_zip:${zip}`;
  const cached = await getKv(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { locationId: string; cachedAt: string };
      if (Date.now() - new Date(parsed.cachedAt).getTime() < 30 * 86400000 && parsed.locationId) {
        return parsed.locationId;
      }
    } catch { /* refresh */ }
  }
  const url = new URL("https://api.kroger.com/v1/locations");
  url.searchParams.set("filter.zipCode.near", zip);
  url.searchParams.set("filter.limit", "1");
  const res = await krogerFetchWithBackoff(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { data?: Array<{ locationId?: string }> } | null;
  const id = body?.data?.[0]?.locationId ?? null;
  if (id) {
    await supabaseAdmin.from("app_kv").upsert({
      key: cacheKey,
      value: JSON.stringify({ locationId: id, cachedAt: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    });
  }
  return id;
}

function normalizePerUnit(price: number, sizeText: string | null): { unitPrice: number; unit: string } | null {
  if (!sizeText || price <= 0) return null;
  const m = sizeText.toLowerCase().match(/([\d.]+)\s*(oz|fl\s*oz|lb|lbs|pound|pounds|g|kg|ml|l|liter|liters|gal|gallon|ct|count|each|ea)\b/);
  if (!m) return null;
  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const t = m[2].replace(/\s+/g, "");
  const unit = t === "lbs" || t === "pound" || t === "pounds" ? "lb"
    : t === "floz" ? "fl_oz"
    : t === "liter" || t === "liters" ? "l"
    : t === "gallon" ? "gal"
    : t === "ct" || t === "count" || t === "ea" ? "each"
    : t;
  return { unitPrice: Number((price / qty).toFixed(4)), unit };
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function runKrogerIngestInternal(opts: {
  mode: "catalog_bootstrap" | "daily_update";
  zip_code?: string;
  limit?: number;
  location_id?: string | null;
}): Promise<{ run_id: string | null; mode: string; location_id: string | null; status: string }> {
  const limit = Math.max(1, Math.min(5000, opts.limit ?? (opts.mode === "catalog_bootstrap" ? 500 : 100)));
  const zip = (opts.zip_code ?? DEFAULT_ZIP).trim();

  let token: string;
  try {
    token = await getToken();
  } catch (e: any) {
    const { data: row } = await supabaseAdmin.from("kroger_ingest_runs").insert({
      status: "failed",
      finished_at: new Date().toISOString(),
      message: `OAuth failed: ${e?.message ?? "unknown"}`,
    }).select("id").single();
    return { run_id: row?.id ?? null, mode: opts.mode, location_id: null, status: "failed" };
  }

  let locationId = opts.location_id?.trim() || (await getSavedLocationId());
  if (!locationId) locationId = await resolveLocationFromZip(zip, token);
  if (!locationId) {
    const { data: row } = await supabaseAdmin.from("kroger_ingest_runs").insert({
      status: "failed",
      finished_at: new Date().toISOString(),
      message: `Could not resolve locationId for ZIP ${zip}`,
    }).select("id").single();
    return { run_id: row?.id ?? null, mode: opts.mode, location_id: null, status: "failed" };
  }

  // Pick item set based on mode
  let items: Array<{ id: string; name: string; unit: string }> = [];
  if (opts.mode === "daily_update") {
    const { data: confirmed } = await supabaseAdmin
      .from("kroger_sku_map")
      .select("reference_id")
      .eq("status", "confirmed")
      .not("reference_id", "is", null);
    const refIds = Array.from(new Set((confirmed ?? []).map((r: any) => r.reference_id).filter(Boolean))) as string[];
    if (refIds.length > 0) {
      const { data: refs } = await supabaseAdmin
        .from("ingredient_reference")
        .select("inventory_item_id")
        .in("id", refIds)
        .not("inventory_item_id", "is", null);
      const invIds = Array.from(new Set((refs ?? []).map((r: any) => r.inventory_item_id).filter(Boolean))) as string[];
      if (invIds.length > 0) {
        const { data: invs } = await supabaseAdmin
          .from("inventory_items")
          .select("id,name,unit")
          .in("id", invIds)
          .limit(limit);
        items = invs ?? [];
      }
    }
  }
  if (items.length === 0) {
    const { data: invs } = await supabaseAdmin
      .from("inventory_items")
      .select("id,name,unit")
      .order("updated_at", { ascending: true })
      .limit(limit);
    items = invs ?? [];
  }

  const { data: runRow } = await supabaseAdmin.from("kroger_ingest_runs").insert({
    status: "running",
    started_at: new Date().toISOString(),
    location_id: locationId,
    item_limit: limit,
    message: `cron mode=${opts.mode} zip=${zip}`,
  }).select("id").single();
  const runId = runRow?.id as string;

  let priceRows = 0, skuTouched = 0, queried = 0;
  const errors: any[] = [];

  for (const item of items) {
    queried++;
    try {
      const term = item.name
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^A-Za-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 128);
      if (term.length < 3) continue;
      const url = new URL("https://api.kroger.com/v1/products");
      url.searchParams.set("filter.term", term);
      url.searchParams.set("filter.limit", "5");
      url.searchParams.set("filter.locationId", locationId);
      const res = await krogerFetchWithBackoff(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        errors.push({ item: item.name, http_status: res.status });
        continue;
      }
      const body = (await res.json()) as { data?: any[] };
      for (const p of body.data ?? []) {
        const sku = p.productId ?? p.upc;
        if (!sku) continue;
        const itemsArr = Array.isArray(p.items) ? p.items : [];
        let regular: number | null = null, promo: number | null = null, sz: string | null = null;
        for (const it of itemsArr) {
          if (typeof it?.price?.regular === "number") regular = regular == null ? it.price.regular : Math.min(regular, it.price.regular);
          if (typeof it?.price?.promo === "number" && it.price.promo > 0) promo = promo == null ? it.price.promo : Math.min(promo, it.price.promo);
          if (!sz && typeof it?.size === "string") sz = it.size;
        }
        if (regular == null && promo == null) continue;
        const observed = (promo ?? regular)!;
        const norm = normalizePerUnit(observed, sz);
        const finalPrice = norm?.unitPrice ?? observed;
        const finalUnit = norm?.unit ?? sz ?? item.unit;
        const productName: string = p.description ?? p.brand ?? item.name;
        const nowIso = new Date().toISOString();

        const { error: mapErr } = await supabaseAdmin.from("kroger_sku_map").upsert({
          sku,
          product_name: productName,
          product_name_normalized: normalizeName(productName),
          last_seen_at: nowIso,
          upc: p.upc ?? null,
          product_id: p.productId ?? null,
          regular_price: regular,
          promo_price: promo,
          price_unit_size: sz,
          price_observed_at: nowIso,
        } as any, { onConflict: "sku" });
        if (!mapErr) skuTouched++;

        const { error: phErr } = await supabaseAdmin.from("price_history").insert({
          inventory_item_id: item.id,
          unit_price: finalPrice,
          unit: finalUnit,
          source: "kroger_api",
          source_id: sku,
          notes: [
            promo != null ? `promo=${promo}` : null,
            regular != null ? `regular=${regular}` : null,
            `loc=${locationId}`,
            norm ? `pack=${sz ?? ""} per_unit=${norm.unitPrice}` : null,
          ].filter(Boolean).join(" "),
        });
        if (!phErr) priceRows++;
      }
    } catch (e: any) {
      errors.push({ item: item.name, error: e?.message ?? "unknown" });
    }
  }

  await supabaseAdmin.from("kroger_ingest_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    items_queried: queried,
    price_rows_written: priceRows,
    sku_map_rows_touched: skuTouched,
    errors: errors.slice(0, 100),
    message: `cron ${opts.mode}: queried ${queried}, wrote ${priceRows}, touched ${skuTouched}`,
  }).eq("id", runId);

  await supabaseAdmin.from("access_audit_log").insert({
    action: "kroger_ingest_run_cron",
    details: { run_id: runId, mode: opts.mode, location_id: locationId, queried, price_rows: priceRows, sku_touched: skuTouched, zip },
  });

  return { run_id: runId, mode: opts.mode, location_id: locationId, status: "completed" };
}
