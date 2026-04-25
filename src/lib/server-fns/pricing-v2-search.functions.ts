// Pricing v2 — Kroger product search server function.
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

    // Resolve store id: explicit override, else settings row.
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

    // Flatten to one row per product, picking the first item (most relevant size).
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
