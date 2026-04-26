// Pricing v2 — Phase 1 Kroger READ+STORE probe.
// Calls Kroger search for each enabled keyword, persists raw payloads to
// pricing_v2_kroger_catalog_raw, and returns a coverage / field-availability
// report. Does NOT mutate item_catalog, recipes, or inventory.
// Auth: requires header `x-probe-token` matching env PROBE_TOKEN.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { searchProducts } from "@/lib/server/pricing-v2/kroger";

export const Route = createFileRoute("/api/public/hooks/pricing-v2-kroger-probe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const limitPerKw = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 25), 50));
        const maxKw = Math.max(1, Math.min(Number(url.searchParams.get("max_keywords") ?? 91), 200));

        // Resolve store
        const { data: settings, error: sErr } = await supabaseAdmin
          .from("pricing_v2_settings")
          .select("kroger_store_id")
          .single();
        if (sErr || !settings?.kroger_store_id) {
          return Response.json({ ok: false, error: "kroger_store_id not configured" }, { status: 400 });
        }
        const storeId = settings.kroger_store_id as string;

        // Enabled keywords
        const { data: kwRows, error: kErr } = await supabaseAdmin
          .from("pricing_v2_keyword_library")
          .select("keyword")
          .eq("enabled", true)
          .order("keyword")
          .limit(maxKw);
        if (kErr) return Response.json({ ok: false, error: kErr.message }, { status: 500 });
        const keywords = (kwRows ?? []).map((r: any) => String(r.keyword));
        if (!keywords.length) return Response.json({ ok: false, error: "no enabled keywords" }, { status: 400 });

        const t0 = Date.now();
        const perKeyword: any[] = [];
        const errors: any[] = [];
        let totalCalls = 0;
        let totalProducts = 0;
        let totalInserted = 0;
        const productKeywordMap = new Map<string, Set<string>>(); // productId -> keywords
        const samples: any[] = [];

        // Field availability accumulators
        let withSize = 0, withUnit = 0, withClearWeight = 0, withCountish = 0;
        let withRegular = 0, withSale = 0, missingPrice = 0;

        for (const kw of keywords) {
          totalCalls++;
          const tk = Date.now();
          let products: any[] = [];
          try {
            products = await searchProducts({ storeId, term: kw, limit: limitPerKw });
          } catch (e: any) {
            errors.push({ keyword: kw, error: String(e?.message ?? e) });
            perKeyword.push({ keyword: kw, products: 0, ms: Date.now() - tk, error: true });
            continue;
          }

          const rows: any[] = [];
          for (const p of products) {
            totalProducts++;
            const pid = p.productId || p.upc || "";
            if (!pid) continue;
            if (!productKeywordMap.has(pid)) productKeywordMap.set(pid, new Set());
            productKeywordMap.get(pid)!.add(kw);

            // Field availability (pure observation, no normalization)
            const item0 = Array.isArray(p.items) ? p.items[0] : null;
            const sizeStr: string | null = item0?.size ?? null;
            const soldBy: string | null = item0?.soldBy ?? null;
            const reg = item0?.price?.regular;
            const promo = item0?.price?.promo;

            if (sizeStr && String(sizeStr).trim()) withSize++;
            if (soldBy && String(soldBy).trim()) withUnit++;
            if (sizeStr && /\b(oz|lb|g|kg|ml|l|fl\s*oz|gal|qt|pt)\b/i.test(sizeStr)) withClearWeight++;
            if ((sizeStr && /\b(ct|count|pack|each|pk)\b/i.test(sizeStr)) || (soldBy && /unit|each/i.test(soldBy))) withCountish++;
            if (typeof reg === "number" && reg > 0) withRegular++;
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
              payload_json: { ...p.raw, _probe_keyword: kw, _probe_fetched_at: new Date().toISOString() },
            });

            if (samples.length < 5) {
              samples.push({
                keyword: kw,
                productId: pid,
                description: p.description,
                brand: p.brand,
                size: sizeStr,
                soldBy,
                price: item0?.price ?? null,
              });
            }
          }

          if (rows.length) {
            const { error: iErr, count } = await supabaseAdmin
              .from("pricing_v2_kroger_catalog_raw")
              .insert(rows, { count: "exact" });
            if (iErr) {
              errors.push({ keyword: kw, error: `insert: ${iErr.message}` });
            } else {
              totalInserted += count ?? rows.length;
            }
          }
          perKeyword.push({ keyword: kw, products: products.length, ms: Date.now() - tk });
        }

        // Duplicates across keywords
        let duplicatesAcrossKeywords = 0;
        for (const set of productKeywordMap.values()) if (set.size > 1) duplicatesAcrossKeywords++;

        const denom = Math.max(1, totalProducts);
        const pct = (n: number) => +((n / denom) * 100).toFixed(1);

        const report = {
          ok: true,
          phase: "kroger_probe_phase1",
          store_id: storeId,
          duration_ms: Date.now() - t0,
          api_health: {
            total_calls: totalCalls,
            success_calls: totalCalls - errors.filter((e) => !String(e.error).startsWith("insert:")).length,
            success_rate_pct: +(((totalCalls - errors.filter((e) => !String(e.error).startsWith("insert:")).length) / Math.max(1, totalCalls)) * 100).toFixed(1),
            errors,
          },
          coverage: {
            total_products_returned: totalProducts,
            total_inserted: totalInserted,
            unique_products: productKeywordMap.size,
            duplicates_across_keywords: duplicatesAcrossKeywords,
            per_keyword: perKeyword,
          },
          field_availability_pct: {
            with_size_string: pct(withSize),
            with_unit_soldBy: pct(withUnit),
            with_clear_weight_unit: pct(withClearWeight),
            with_count_pack_each: pct(withCountish),
          },
          price_structure_pct: {
            with_regular: pct(withRegular),
            with_sale: pct(withSale),
            missing_price: pct(missingPrice),
          },
          samples,
        };

        return Response.json(report);
      },
      GET: async () => new Response("POST to run the Kroger probe (admin)", { status: 200 }),
    },
  },
});
