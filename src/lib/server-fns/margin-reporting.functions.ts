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
      (acc, r) => {
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
