// Pricing v2 — Kroger product search + UPC-to-inventory mapping +
// catalog data browse server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchProducts } from "@/lib/server/pricing-v2/kroger";

const inputSchema = z.object({
  term: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(100).default(25),
  storeId: z.string().trim().min(1).max(32).optional(),
});

export type KrogerSearchHit = {
  productId: string;
  upc?: string;
  description?: string;
  brand?: string;
  size?: string;
  soldBy?: string;
  regularPrice?: number;
  promoPrice?: number;
};

export const searchKrogerProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    let storeId = data.storeId;
    if (!storeId) {
      const { data: s } = await supabase
        .from("pricing_v2_settings")
        .select("kroger_store_id")
        .eq("id", 1)
        .maybeSingle();
      storeId = s?.kroger_store_id;
    }
    if (!storeId) {
      throw new Error("No Kroger store id configured. Set one in Pricing v2 → Settings.");
    }

    const products = await searchProducts({
      storeId,
      term: data.term,
      limit: data.limit,
    });

    const hits: KrogerSearchHit[] = products.map((p) => {
      const item = p.items?.[0];
      return {
        productId: p.productId,
        upc: p.upc,
        description: p.description,
        brand: p.brand,
        size: item?.size,
        soldBy: item?.soldBy,
        regularPrice: item?.price?.regular,
        promoPrice: item?.price?.promo,
      };
    });

    return { storeId, term: data.term, count: hits.length, hits };
  });

// ---------------------------------------------------------------------------
// Inventory items list — for the mapping picker on the Search page.
// ---------------------------------------------------------------------------

const listInventorySchema = z.object({
  search: z.string().trim().max(120).optional(),
  onlyUnmapped: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50),
});

export type InventoryItemLite = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  kroger_product_id: string | null;
};

export const listInventoryForMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInventorySchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("inventory_items")
      .select("id,name,category,unit,kroger_product_id")
      .order("name", { ascending: true })
      .limit(data.limit);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    if (data.onlyUnmapped) q = q.is("kroger_product_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as InventoryItemLite[] };
  });

// ---------------------------------------------------------------------------
// Map a UPC onto an inventory item.
// Uses requireSupabaseAuth so RLS enforces admin-only writes via existing policies.
// ---------------------------------------------------------------------------

const mapSchema = z.object({
  inventoryItemId: z.string().uuid(),
  upc: z.string().trim().min(6).max(32),
});

export const mapUpcToInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mapSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("inventory_items")
      .update({ kroger_product_id: data.upc })
      .eq("id", data.inventoryItemId)
      .select("id,name,kroger_product_id")
      .single();
    if (error) throw new Error(error.message);
    return { item: row };
  });

// ---------------------------------------------------------------------------
// Catalog data browse — for the new Catalog Data viewer page.
// ---------------------------------------------------------------------------

const browseSchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listItemCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => browseSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_item_catalog")
      .select(
        "id,store_id,upc,kroger_product_id,name,brand,size_raw,net_weight_grams,weight_source,manual_net_weight_grams,manual_override_reason,updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.search) {
      const like = `%${data.search}%`;
      q = q.or(`name.ilike.${like},upc.ilike.${like},brand.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const listKrogerCatalogRaw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => browseSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_kroger_catalog_raw")
      .select(
        "id,run_id,store_id,upc,kroger_product_id,name,brand,size_raw,fetched_at,payload_json"
      )
      .order("fetched_at", { ascending: false })
      .limit(data.limit);
    if (data.search) {
      const like = `%${data.search}%`;
      q = q.or(`name.ilike.${like},upc.ilike.${like},brand.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// Bulk auto-suggest UPCs for unmapped inventory items.
// For each unmapped item, run a Kroger keyword search and return the top hits
// so an admin can approve mappings in one click.
// ---------------------------------------------------------------------------

const bulkSuggestSchema = z.object({
  limit: z.number().int().min(1).max(200).default(25),
  hitsPerItem: z.number().int().min(1).max(10).default(5),
  storeId: z.string().trim().min(1).max(32).optional(),
  search: z.string().trim().max(120).optional(),
});

export type BulkSuggestion = {
  inventoryItemId: string;
  inventoryName: string;
  category: string | null;
  unit: string | null;
  query: string;
  hits: KrogerSearchHit[];
  error?: string;
};

export const bulkSuggestUpcsForInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkSuggestSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    let storeId = data.storeId;
    if (!storeId) {
      const { data: s } = await supabase
        .from("pricing_v2_settings")
        .select("kroger_store_id")
        .eq("id", 1)
        .maybeSingle();
      storeId = s?.kroger_store_id;
    }
    if (!storeId) {
      throw new Error("No Kroger store id configured. Set one in Pricing v2 → Settings.");
    }

    let q = supabase
      .from("inventory_items")
      .select("id,name,category,unit")
      .is("kroger_product_id", null)
      .order("name", { ascending: true })
      .limit(data.limit);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: items, error } = await q;
    if (error) throw new Error(error.message);

    const suggestions: BulkSuggestion[] = [];
    // Sequential to respect Kroger rate limits.
    for (const it of items ?? []) {
      const query = String(it.name ?? "").trim();
      if (!query) continue;
      try {
        const products = await searchProducts({
          storeId,
          term: query,
          limit: data.hitsPerItem,
        });
        const hits: KrogerSearchHit[] = products.map((p) => {
          const item = p.items?.[0];
          return {
            productId: p.productId,
            upc: p.upc,
            description: p.description,
            brand: p.brand,
            size: item?.size,
            soldBy: item?.soldBy,
            regularPrice: item?.price?.regular,
            promoPrice: item?.price?.promo,
          };
        });
        suggestions.push({
          inventoryItemId: it.id,
          inventoryName: it.name,
          category: it.category,
          unit: it.unit,
          query,
          hits,
        });
      } catch (e: any) {
        suggestions.push({
          inventoryItemId: it.id,
          inventoryName: it.name,
          category: it.category,
          unit: it.unit,
          query,
          hits: [],
          error: e?.message ?? "search failed",
        });
      }
    }

    return { storeId, suggestions, count: suggestions.length };
  });

// ---------------------------------------------------------------------------
// Bulk approve a set of inventory_id → UPC mappings in one call.
// ---------------------------------------------------------------------------

const bulkApproveSchema = z.object({
  mappings: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        upc: z.string().trim().min(6).max(32),
      })
    )
    .min(1)
    .max(500),
});

export const bulkApproveUpcMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkApproveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let updated = 0;
    const errors: Array<{ inventoryItemId: string; message: string }> = [];
    for (const m of data.mappings) {
      const { error } = await supabase
        .from("inventory_items")
        .update({ kroger_product_id: m.upc })
        .eq("id", m.inventoryItemId);
      if (error) {
        errors.push({ inventoryItemId: m.inventoryItemId, message: error.message });
      } else {
        updated += 1;
      }
    }
    return { updated, errors };
  });

export const getCatalogStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const [raw, cat, mapped, unmapped] = await Promise.all([
      supabase.from("pricing_v2_kroger_catalog_raw").select("*", { count: "exact", head: true }),
      supabase.from("pricing_v2_item_catalog").select("*", { count: "exact", head: true }),
      supabase.from("inventory_items").select("*", { count: "exact", head: true }).not("kroger_product_id", "is", null),
      supabase.from("inventory_items").select("*", { count: "exact", head: true }).is("kroger_product_id", null),
    ]);
    return {
      raw_count: raw.count ?? 0,
      catalog_count: cat.count ?? 0,
      inventory_mapped: mapped.count ?? 0,
      inventory_unmapped: unmapped.count ?? 0,
    };
  });
