import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Monthly scheduled hook: ensures a staging slot exists for the previous calendar month.
 *
 * Behavior (no AI, no external services):
 * - Computes target month = previous calendar month (YYYY-MM)
 * - Carries forward the most recent staged price per ingredient into the target month
 *   (only if no row already exists for that ingredient in the target month)
 * - Never modifies national_price_snapshots
 * - Never modifies quotes
 *
 * Admins still review and explicitly Activate the month from /admin/pricing/national.
 */
export const Route = createFileRoute("/hooks/national-prices-monthly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
          return new Response(JSON.stringify({ error: "Missing auth" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const d = new Date();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - 1);
        const targetMonth = d.toISOString().slice(0, 7);

        // Latest staged row per ingredient (across any prior month)
        const { data: staged, error: stagedErr } = await supabaseAdmin
          .from("national_price_staging")
          .select("ingredient_id, price, unit, region, source, month, fetched_at")
          .order("fetched_at", { ascending: false })
          .limit(10000);
        if (stagedErr) {
          return new Response(JSON.stringify({ error: stagedErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const latestByIng = new Map<string, any>();
        for (const r of staged ?? []) {
          if (!latestByIng.has((r as any).ingredient_id)) {
            latestByIng.set((r as any).ingredient_id, r);
          }
        }

        // Existing rows in target month — skip those
        const { data: existing } = await supabaseAdmin
          .from("national_price_staging")
          .select("ingredient_id")
          .eq("month", targetMonth);
        const existingIds = new Set<string>(
          (existing ?? []).map((r: any) => r.ingredient_id),
        );

        let inserted = 0;
        const errors: string[] = [];
        for (const [ingredientId, row] of latestByIng) {
          if (existingIds.has(ingredientId)) continue;
          const { error } = await supabaseAdmin.from("national_price_staging").insert({
            ingredient_id: ingredientId,
            price: row.price,
            unit: row.unit,
            region: row.region,
            month: targetMonth,
            source: row.source ? `${row.source} (carry-forward)` : "carry-forward",
            fetched_at: new Date().toISOString(),
          });
          if (error) errors.push(`${ingredientId}: ${error.message}`);
          else inserted += 1;
        }

        return new Response(
          JSON.stringify({
            success: true,
            targetMonth,
            inserted,
            sourceRows: latestByIng.size,
            errors,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
