// Pricing v2 — minimal Kroger Products API client.
// Server-only. Uses client-credentials OAuth and the public products endpoint.
//
// NOTE: This is a fresh, Pricing-v2-only client. It is NOT shared with the
// archived Pricing v1 Kroger ingest.

const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
const PRODUCTS_URL = "https://api.kroger.com/v1/products";

let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("KROGER_CLIENT_ID / KROGER_CLIENT_SECRET are not configured");
  }
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "product.compact",
  });
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Kroger token request failed [${res.status}]: ${txt}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.token;
}

export type KrogerProduct = {
  productId: string;
  upc?: string;
  description?: string;
  brand?: string;
  items?: Array<{
    itemId?: string;
    size?: string;
    soldBy?: string;
    price?: { regular?: number; promo?: number };
  }>;
  raw: Record<string, any>;
};

function normalize(p: any): KrogerProduct {
  return {
    productId: String(p.productId ?? p.upc ?? ""),
    upc: p.upc ?? undefined,
    description: p.description ?? undefined,
    brand: p.brand ?? undefined,
    items: Array.isArray(p.items) ? p.items : undefined,
    raw: p,
  };
}

/** Fetch products by Kroger product IDs (UPCs). filter.productId max 50/call. */
export async function fetchProductsByIds(opts: {
  storeId: string;
  productIds: string[];
}): Promise<KrogerProduct[]> {
  if (!opts.productIds.length) return [];
  const token = await getAccessToken();
  const out: KrogerProduct[] = [];
  // Kroger allows up to 50 IDs per call.
  for (let i = 0; i < opts.productIds.length; i += 50) {
    const batch = opts.productIds.slice(i, i + 50);
    const url = new URL(PRODUCTS_URL);
    url.searchParams.set("filter.productId", batch.join(","));
    url.searchParams.set("filter.locationId", opts.storeId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Kroger products by id failed [${res.status}]: ${txt}`);
    }
    const json = (await res.json()) as { data?: any[] };
    for (const p of json.data ?? []) out.push(normalize(p));
  }
  return out;
}

/** Search products by keyword (paginated). limit caps total returned. */
export async function searchProducts(opts: {
  storeId: string;
  term: string;
  limit?: number;
}): Promise<KrogerProduct[]> {
  const token = await getAccessToken();
  const out: KrogerProduct[] = [];
  const cap = Math.max(1, Math.min(opts.limit ?? 50, 500));
  const pageSize = 50;
  let start = 1;
  while (out.length < cap) {
    const url = new URL(PRODUCTS_URL);
    url.searchParams.set("filter.term", opts.term);
    url.searchParams.set("filter.locationId", opts.storeId);
    url.searchParams.set("filter.limit", String(Math.min(pageSize, cap - out.length)));
    url.searchParams.set("filter.start", String(start));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Kroger search failed [${res.status}]: ${txt}`);
    }
    const json = (await res.json()) as { data?: any[]; meta?: { pagination?: { total?: number } } };
    const rows = json.data ?? [];
    for (const p of rows) out.push(normalize(p));
    if (rows.length < pageSize) break;
    start += pageSize;
  }
  return out.slice(0, cap);
}
