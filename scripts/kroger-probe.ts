// Phase 1 Kroger probe — standalone runner. Uses the same kroger.ts logic
// inline, writes to pricing_v2_kroger_catalog_raw via service role.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KROGER_ID = process.env.KROGER_CLIENT_ID!;
const KROGER_SECRET = process.env.KROGER_CLIENT_SECRET!;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!KROGER_ID || !KROGER_SECRET) throw new Error("Missing KROGER_CLIENT_ID/SECRET");

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
const PRODUCTS_URL = "https://api.kroger.com/v1/products";
let cachedTok: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedTok && cachedTok.exp > Date.now() + 30_000) return cachedTok.token;
  const basic = Buffer.from(`${KROGER_ID}:${KROGER_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" }).toString(),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  cachedTok = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cachedTok.token;
}

async function search(storeId: string, term: string, cap: number) {
  const tok = await getToken();
  const out: any[] = [];
  const page = 50;
  let start = 1;
  while (out.length < cap) {
    const u = new URL(PRODUCTS_URL);
    u.searchParams.set("filter.term", term);
    u.searchParams.set("filter.locationId", storeId);
    u.searchParams.set("filter.limit", String(Math.min(page, cap - out.length)));
    u.searchParams.set("filter.start", String(start));
    const res = await fetch(u, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`search ${res.status}: ${await res.text()}`);
    const j: any = await res.json();
    const rows = j.data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
    start += page;
  }
  return out.slice(0, cap);
}

async function main() {
  const limitPerKw = Number(process.env.LIMIT ?? 15);

  const { data: settings } = await sb.from("pricing_v2_settings").select("kroger_store_id").single();
  const storeId = (settings as any)?.kroger_store_id;
  if (!storeId) throw new Error("kroger_store_id not set");

  const { data: kwRows } = await sb.from("pricing_v2_keyword_library").select("keyword").eq("enabled", true).order("keyword");
  const keywords: string[] = (kwRows ?? []).map((r: any) => String(r.keyword));
  console.error(`store=${storeId} keywords=${keywords.length} limit_per_kw=${limitPerKw}`);

  const t0 = Date.now();
  const errors: any[] = [];
  const perKeyword: any[] = [];
  let totalCalls = 0, totalProducts = 0, totalInserted = 0;
  let withSize = 0, withUnit = 0, withClearWeight = 0, withCountish = 0;
  let withReg = 0, withSale = 0, missingPrice = 0;
  const productKw = new Map<string, Set<string>>();
  const samples: any[] = [];

  for (const kw of keywords) {
    totalCalls++;
    const tk = Date.now();
    let products: any[] = [];
    try {
      products = await search(storeId, kw, limitPerKw);
    } catch (e: any) {
      errors.push({ keyword: kw, error: String(e?.message ?? e) });
      perKeyword.push({ keyword: kw, products: 0, ms: Date.now() - tk, error: true });
      console.error(`  ${kw}: ERROR ${e?.message}`);
      continue;
    }

    const rows: any[] = [];
    for (const p of products) {
      totalProducts++;
      const pid = String(p.productId ?? p.upc ?? "");
      if (!pid) continue;
      if (!productKw.has(pid)) productKw.set(pid, new Set());
      productKw.get(pid)!.add(kw);

      const item0 = Array.isArray(p.items) ? p.items[0] : null;
      const sizeStr: string | null = item0?.size ?? null;
      const soldBy: string | null = item0?.soldBy ?? null;
      const reg = item0?.price?.regular;
      const promo = item0?.price?.promo;
      if (sizeStr && String(sizeStr).trim()) withSize++;
      if (soldBy && String(soldBy).trim()) withUnit++;
      if (sizeStr && /\b(oz|lb|g|kg|ml|l|fl\s*oz|gal|qt|pt)\b/i.test(sizeStr)) withClearWeight++;
      if ((sizeStr && /\b(ct|count|pack|each|pk)\b/i.test(sizeStr)) || (soldBy && /unit|each/i.test(soldBy))) withCountish++;
      if (typeof reg === "number" && reg > 0) withReg++;
      if (typeof promo === "number" && promo > 0) withSale++;
      if (!(typeof reg === "number" && reg > 0) && !(typeof promo === "number" && promo > 0)) missingPrice++;

      rows.push({
        run_id: null,
        store_id: storeId,
        kroger_product_id: pid,
        upc: p.upc ?? null,
        name: p.description ?? "(unknown)",
        brand: p.brand ?? null,
        size_raw: sizeStr ?? null,
        payload_json: { ...p, _probe_keyword: kw, _probe_fetched_at: new Date().toISOString() },
      });

      if (samples.length < 5) {
        samples.push({ keyword: kw, productId: pid, description: p.description, brand: p.brand, size: sizeStr, soldBy, price: item0?.price ?? null });
      }
    }

    if (rows.length) {
      const { error: iErr, count } = await sb.from("pricing_v2_kroger_catalog_raw").insert(rows, { count: "exact" });
      if (iErr) {
        errors.push({ keyword: kw, error: `insert: ${iErr.message}` });
        console.error(`  ${kw}: INSERT ERR ${iErr.message}`);
      } else {
        totalInserted += count ?? rows.length;
      }
    }
    perKeyword.push({ keyword: kw, products: products.length, inserted: rows.length, ms: Date.now() - tk });
    console.error(`  ${kw}: ${products.length} products (${Date.now() - tk}ms)`);
  }

  let dupes = 0;
  for (const s of productKw.values()) if (s.size > 1) dupes++;
  const denom = Math.max(1, totalProducts);
  const pct = (n: number) => +((n / denom) * 100).toFixed(1);

  const report = {
    ok: true,
    phase: "kroger_probe_phase1",
    store_id: storeId,
    duration_ms: Date.now() - t0,
    api_health: {
      total_calls: totalCalls,
      api_errors: errors.filter((e) => !String(e.error).startsWith("insert:")).length,
      insert_errors: errors.filter((e) => String(e.error).startsWith("insert:")).length,
      success_rate_pct: +(((totalCalls - errors.filter((e) => !String(e.error).startsWith("insert:")).length) / Math.max(1, totalCalls)) * 100).toFixed(1),
      errors,
    },
    coverage: {
      total_products_returned: totalProducts,
      total_inserted: totalInserted,
      unique_products: productKw.size,
      duplicates_across_keywords: dupes,
      per_keyword: perKeyword,
    },
    field_availability_pct: {
      with_size_string: pct(withSize),
      with_unit_soldBy: pct(withUnit),
      with_clear_weight_unit: pct(withClearWeight),
      with_count_pack_each: pct(withCountish),
    },
    price_structure_pct: {
      with_regular: pct(withReg),
      with_sale: pct(withSale),
      missing_price: pct(missingPrice),
    },
    samples,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
