import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verifies that catalog_bootstrap persists every Kroger product into
 * kroger_sku_map with review_state="unmatched" (the default when there is
 * no confident ingredient match). Mocks both the Kroger HTTP API and the
 * Supabase admin client so the test runs offline.
 */

// ── Captured upserts (filled by the mocked supabase client) ─────────────────
type UpsertCall = { table: string; payload: any; opts?: any };
const upsertCalls: UpsertCall[] = [];
const updateCalls: Array<{ table: string; payload: any }> = [];

// ── Mock @/lib/server/kroger-core ───────────────────────────────────────────
// Short-circuit OAuth + location resolution and provide a trivial scorer.
vi.mock("@/lib/server/kroger-core", () => {
  const fakeFetch = vi.fn(async (url: string) => {
    const u = new URL(url);
    const term = u.searchParams.get("filter.term") ?? "";
    const start = Number(u.searchParams.get("filter.start") ?? "0");
    // Return 2 products on the first page for the first term, then empty.
    if (start === 0 && term === "milk") {
      return new Response(
        JSON.stringify({
          data: [
            {
              productId: "0001111041700",
              upc: "0001111041700",
              description: "Kroger 2% Reduced Fat Milk",
              brand: "Kroger",
              items: [{ size: "1 gal" }],
            },
            {
              productId: "0001111042200",
              upc: "0001111042200",
              description: "Simple Truth Organic Whole Milk",
              brand: "Simple Truth",
              items: [{ size: "0.5 gal" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });

  return {
    BOOTSTRAP_SEARCH_TERMS: ["milk"], // single term keeps the test small
    KROGER_DEFAULT_ZIP: "44202",
    getKrogerFetch: vi.fn(async () => fakeFetch),
    isValidKrogerLocationId: (id: string) => /^[A-Za-z0-9]{8}$/.test(id),
    normalizeForScoring: (s: string) => s.toLowerCase().trim(),
    normalizeKrogerPrice: () => null,
    resolveRunLocationId: vi.fn(async () => "01400376"),
    // Always return 0 → no confident match → review_state must be "unmatched"
    scoreSkuMatch: () => 0,
  };
});

// ── Mock @/integrations/supabase/client.server ──────────────────────────────
// Chainable query-builder stub that records every .upsert() and .update().
vi.mock("@/integrations/supabase/client.server", () => {
  function builder(table: string) {
    const chain: any = {
      _table: table,
      select: () => chain,
      eq: () => chain,
      range: async () => ({ data: [], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: "run-test-id" }, error: null }),
      limit: async () => ({ data: [], error: null }),
      insert: (payload: any) => {
        // .insert(...).select().single() chain used for new run row
        return {
          select: () => ({
            single: async () => ({ data: { id: "run-test-id" }, error: null }),
          }),
          // also support a bare await on insert (no .select())
          then: (resolve: any) => resolve({ data: null, error: null }),
        };
      },
      upsert: async (payload: any, opts?: any) => {
        upsertCalls.push({ table, payload, opts });
        return { data: null, error: null };
      },
      update: (payload: any) => {
        updateCalls.push({ table, payload });
        return { eq: async () => ({ data: null, error: null }) };
      },
    };
    return chain;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => builder(table),
    },
  };
});

// Import AFTER mocks are registered.
import { runKrogerIngestInternal } from "./kroger-ingest-internal";

describe("catalog_bootstrap persistence", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    updateCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("upserts every Kroger product into kroger_sku_map with review_state='unmatched'", async () => {
    const result = await runKrogerIngestInternal({
      mode: "catalog_bootstrap",
      zip_code: "44202",
      limit: 100,
    });

    expect(result.status).toBe("completed");
    expect(result.location_id).toBe("01400376");

    // Filter to just the kroger_sku_map upserts
    const skuUpserts = upsertCalls.filter((c) => c.table === "kroger_sku_map");
    expect(skuUpserts.length).toBe(2);

    // Every row must be marked "unmatched" (scoreSkuMatch returns 0 → no match)
    for (const call of skuUpserts) {
      expect(call.payload.review_state).toBe("unmatched");
      expect(call.payload.reference_id).toBeNull();
      expect(call.payload.match_confidence).toBeNull();
      expect(call.opts).toEqual({ onConflict: "sku" });
      // Required identity fields are populated
      expect(call.payload.sku).toBeTruthy();
      expect(call.payload.product_name).toBeTruthy();
      expect(call.payload.last_seen_at).toBeTruthy();
    }

    // Specific SKUs from the mocked Kroger response
    const skus = skuUpserts.map((c) => c.payload.sku).sort();
    expect(skus).toEqual(["0001111041700", "0001111042200"]);

    // Final run record marks the run completed with sku_map_rows_touched > 0
    const runUpdate = updateCalls.find((u) => u.table === "kroger_ingest_runs");
    expect(runUpdate?.payload.status).toBe("completed");
    expect(runUpdate?.payload.sku_map_rows_touched).toBe(2);
    expect(runUpdate?.payload.price_rows_written).toBe(0); // bootstrap never writes prices
  });
});
