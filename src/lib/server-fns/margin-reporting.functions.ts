import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Quoted vs Actual margin reporting.
 * - Quoted food cost: from quotes.theoretical_cost (or sum of recipe cost_per_serving * qty as fallback)
 * - Actual food cost: receipts.total_amount where linked_quote_id matches
 * - Variance: actual - quoted, plus pct
 *
 * Read-only & deterministic. No AI. No retroactive updates.
 */

export const getQuoteMarginVariance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quote_id: string }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: quote } = await sb
      .from("quotes")
      .select("id, total, theoretical_cost, actual_cost, guest_count, event_date")
      .eq("id", data.quote_id)
      .maybeSingle();
    if (!quote) throw new Error("Quote not found");

    let quotedCost = Number(quote.theoretical_cost) || 0;
    if (!quotedCost) {
      const { data: items } = await sb
        .from("quote_items")
        .select("quantity, recipes(cost_per_serving)")
        .eq("quote_id", data.quote_id);
      quotedCost = (items ?? []).reduce(
        (s: number, r: any) =>
          s + (Number(r.quantity) || 0) * (Number(r.recipes?.cost_per_serving) || 0),
        0,
      );
    }

    const { data: receipts } = await sb
      .from("receipts")
      .select("total_amount")
      .eq("linked_quote_id", data.quote_id);
    const actualCost =
      Number(quote.actual_cost) ||
      (receipts ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);

    const variance = Math.round((actualCost - quotedCost) * 100) / 100;
    const pct = quotedCost > 0 ? Math.round((variance / quotedCost) * 1000) / 10 : 0;
    const revenue = Number(quote.total) || 0;
    const quotedMarginPct =
      revenue > 0 ? Math.round(((revenue - quotedCost) / revenue) * 1000) / 10 : 0;
    const actualMarginPct =
      revenue > 0 ? Math.round(((revenue - actualCost) / revenue) * 1000) / 10 : 0;

    return {
      quote_id: data.quote_id,
      revenue,
      quotedCost: Math.round(quotedCost * 100) / 100,
      actualCost: Math.round(actualCost * 100) / 100,
      variance,
      variancePct: pct,
      quotedMarginPct,
      actualMarginPct,
    };
  });

export const getMarginVarianceRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from?: string; to?: string }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb
      .from("quotes")
      .select("id, reference_number, event_date, total, theoretical_cost, actual_cost")
      .not("event_date", "is", null);
    if (data.from) q = q.gte("event_date", data.from);
    if (data.to) q = q.lte("event_date", data.to);
    const { data: rows } = await q.order("event_date", { ascending: false }).limit(500);

    const out = (rows ?? []).map((r: any) => {
      const revenue = Number(r.total) || 0;
      const quoted = Number(r.theoretical_cost) || 0;
      const actual = Number(r.actual_cost) || 0;
      const variance = Math.round((actual - quoted) * 100) / 100;
      return {
        id: r.id,
        reference_number: r.reference_number,
        event_date: r.event_date,
        revenue,
        quotedCost: quoted,
        actualCost: actual,
        variance,
        variancePct: quoted > 0 ? Math.round((variance / quoted) * 1000) / 10 : 0,
      };
    });

    const totals = out.reduce(
      (acc: { revenue: number; quoted: number; actual: number }, r: any) => {
        acc.revenue += r.revenue;
        acc.quoted += r.quotedCost;
        acc.actual += r.actualCost;
        return acc;
      },
      { revenue: 0, quoted: 0, actual: 0 },
    );
    return {
      rows: out,
      totals: {
        revenue: Math.round(totals.revenue * 100) / 100,
        quotedCost: Math.round(totals.quoted * 100) / 100,
        actualCost: Math.round(totals.actual * 100) / 100,
        variance: Math.round((totals.actual - totals.quoted) * 100) / 100,
        variancePct:
          totals.quoted > 0
            ? Math.round(((totals.actual - totals.quoted) / totals.quoted) * 1000) / 10
            : 0,
      },
    };
  });

/**
 * Per-ingredient theoretical vs actual cost variance for a quote.
 *
 * Theoretical: sum over each quote_item of
 *   recipe_ingredient.quantity * recipe_ingredient.cost_per_unit * quote_item.quantity (servings)
 *   grouped by inventory_item_id (or by ingredient name when no inventory link).
 *
 * Actual: aggregated `extracted_line_items` (only entries with matched_inventory_id)
 * from receipts where linked_quote_id = this quote, summing total_price per inventory item.
 *
 * Read-only. Sorted by absolute variance descending so the biggest drivers surface first.
 */
export const getQuoteIngredientVariance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quote_id: string }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;

    const { data: items } = await sb
      .from("quote_items")
      .select("recipe_id, quantity")
      .eq("quote_id", data.quote_id);

    type Row = {
      key: string;
      inventory_item_id: string | null;
      name: string;
      theoreticalCost: number;
      actualCost: number;
    };
    const byKey = new Map<string, Row>();
    const upsert = (key: string, name: string, inventoryId: string | null) => {
      let r = byKey.get(key);
      if (!r) {
        r = { key, inventory_item_id: inventoryId, name, theoreticalCost: 0, actualCost: 0 };
        byKey.set(key, r);
      }
      // Prefer the more descriptive name when one is empty
      if (!r.name && name) r.name = name;
      if (!r.inventory_item_id && inventoryId) r.inventory_item_id = inventoryId;
      return r;
    };

    // ---- Theoretical: walk each quote_item -> recipe_ingredients ----
    for (const it of items ?? []) {
      if (!it.recipe_id) continue;
      const servings = Number(it.quantity) || 0;
      if (servings <= 0) continue;
      const { data: ings } = await sb
        .from("recipe_ingredients")
        .select("name, quantity, cost_per_unit, inventory_item_id")
        .eq("recipe_id", it.recipe_id);
      for (const ing of ings ?? []) {
        const qty = Number(ing.quantity) || 0;
        const cpu = Number(ing.cost_per_unit) || 0;
        if (qty <= 0 || cpu <= 0) continue;
        const lineCost = qty * cpu * servings;
        const key = ing.inventory_item_id
          ? `inv:${ing.inventory_item_id}`
          : `name:${(ing.name || "").trim().toLowerCase()}`;
        const row = upsert(key, ing.name || "Unknown", ing.inventory_item_id || null);
        row.theoreticalCost += lineCost;
      }
    }

    // ---- Actual: walk receipts.extracted_line_items, group by matched inventory ----
    const { data: receipts } = await sb
      .from("receipts")
      .select("extracted_line_items")
      .eq("linked_quote_id", data.quote_id);
    for (const rcpt of receipts ?? []) {
      const lines = Array.isArray(rcpt.extracted_line_items) ? rcpt.extracted_line_items : [];
      for (const li of lines) {
        const total = Number(li?.total_price) || 0;
        if (total <= 0) continue;
        const invId: string | null = li?.matched_inventory_id || null;
        const name: string = li?.matched_inventory_name || li?.item_name || "Unknown";
        const key = invId ? `inv:${invId}` : `name:${(name || "").trim().toLowerCase()}`;
        const row = upsert(key, name, invId);
        row.actualCost += total;
      }
    }

    // Resolve names for inventory-only rows
    const missingNameIds = Array.from(byKey.values())
      .filter((r) => r.inventory_item_id && (!r.name || r.name === "Unknown"))
      .map((r) => r.inventory_item_id!) as string[];
    if (missingNameIds.length > 0) {
      const { data: inv } = await sb
        .from("inventory_items")
        .select("id,name")
        .in("id", missingNameIds);
      const nameMap = new Map<string, string>((inv ?? []).map((x: any) => [x.id, x.name]));
      for (const r of byKey.values()) {
        if (r.inventory_item_id && nameMap.has(r.inventory_item_id)) {
          r.name = nameMap.get(r.inventory_item_id)!;
        }
      }
    }

    const rows = Array.from(byKey.values()).map((r) => {
      const theoretical = Math.round(r.theoreticalCost * 100) / 100;
      const actual = Math.round(r.actualCost * 100) / 100;
      const variance = Math.round((actual - theoretical) * 100) / 100;
      const variancePct =
        theoretical > 0 ? Math.round((variance / theoretical) * 1000) / 10 : null;
      return {
        key: r.key,
        inventory_item_id: r.inventory_item_id,
        name: r.name,
        theoreticalCost: theoretical,
        actualCost: actual,
        variance,
        variancePct,
        absVariance: Math.abs(variance),
      };
    });

    rows.sort((a, b) => b.absVariance - a.absVariance);

    const totals = rows.reduce(
      (acc, r) => {
        acc.theoretical += r.theoreticalCost;
        acc.actual += r.actualCost;
        return acc;
      },
      { theoretical: 0, actual: 0 },
    );
    const totalVariance = Math.round((totals.actual - totals.theoretical) * 100) / 100;

    return {
      quote_id: data.quote_id,
      rows,
      totals: {
        theoreticalCost: Math.round(totals.theoretical * 100) / 100,
        actualCost: Math.round(totals.actual * 100) / 100,
        variance: totalVariance,
        variancePct:
          totals.theoretical > 0
            ? Math.round((totalVariance / totals.theoretical) * 1000) / 10
            : 0,
      },
    };
  });
