import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Apply edited supplier unit prices from a processed receipt to the matched
 * inventory items, then automatically re-cost the linked quote (if any).
 *
 * - Updates `inventory_items.average_cost_per_unit` and `last_receipt_cost`
 *   for every line that has a `matched_inventory_id` and a positive unit_price.
 * - When the receipt has `linked_quote_id`, recomputes recipe costs and quote
 *   totals using the same logic as `recalcQuotePricing`.
 */
export const applyReceiptCostsAndRecalc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      receiptId: z.string().uuid(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // 1. Load the receipt
    const { data: receipt, error: rErr } = await supabase
      .from("receipts")
      .select("id, status, linked_quote_id, extracted_line_items")
      .eq("id", data.receiptId)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!receipt) throw new Error("Receipt not found");

    const items = Array.isArray(receipt.extracted_line_items)
      ? (receipt.extracted_line_items as any[])
      : [];

    // 2. Apply unit prices to matched inventory items
    const updates: Array<{ id: string; name: string; oldCost: number; newCost: number }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const it of items) {
      const invId: string | null = it?.matched_inventory_id ?? null;
      const price = Number(it?.unit_price);
      const name = String(it?.item_name ?? "");
      if (!invId) {
        if (name.trim()) skipped.push({ name, reason: "no inventory match" });
        continue;
      }
      if (!Number.isFinite(price) || price <= 0) {
        skipped.push({ name, reason: "invalid unit price" });
        continue;
      }

      const { data: inv } = await supabase
        .from("inventory_items")
        .select("id, name, average_cost_per_unit")
        .eq("id", invId)
        .maybeSingle();
      if (!inv) {
        skipped.push({ name, reason: "inventory item missing" });
        continue;
      }

      const rounded = Math.round(price * 10000) / 10000;
      const { error: upErr } = await supabase
        .from("inventory_items")
        .update({
          average_cost_per_unit: rounded,
          last_receipt_cost: rounded,
        })
        .eq("id", invId);
      if (upErr) throw upErr;

      updates.push({
        id: inv.id,
        name: inv.name,
        oldCost: Number(inv.average_cost_per_unit) || 0,
        newCost: rounded,
      });
    }

    // Mark receipt as processed once we've applied costs
    await supabase
      .from("receipts")
      .update({ status: "processed" })
      .eq("id", data.receiptId);

    // 3. If there's a linked quote, recompute recipes + quote totals
    let recalc: null | {
      quoteId: string;
      updatedItems: number;
      subtotal: number;
      total: number;
      perGuest: number;
      markup: number;
    } = null;

    if (receipt.linked_quote_id) {
      const quoteId = receipt.linked_quote_id;

      const { data: settings } = await supabase
        .from("app_settings")
        .select("markup_multiplier")
        .eq("id", 1)
        .maybeSingle();
      const markup = Number(settings?.markup_multiplier) || 3.0;

      const { data: qItems, error: qiErr } = await supabase
        .from("quote_items")
        .select("id, quantity, recipe_id")
        .eq("quote_id", quoteId);
      if (qiErr) throw qiErr;

      let updatedItems = 0;
      for (const item of qItems ?? []) {
        if (!item.recipe_id) continue;
        await supabase.rpc("recompute_recipe_cost", { _recipe_id: item.recipe_id });
        const { data: recipe } = await supabase
          .from("recipes")
          .select("cost_per_serving")
          .eq("id", item.recipe_id)
          .maybeSingle();
        const cps = Number(recipe?.cost_per_serving) || 0;
        const unit = Math.round(cps * markup * 100) / 100;
        const qty = Number(item.quantity) || 1;
        const total = Math.round(unit * qty * 100) / 100;
        const { error: upQiErr } = await supabase
          .from("quote_items")
          .update({ unit_price: unit, total_price: total })
          .eq("id", item.id);
        if (upQiErr) throw upQiErr;
        updatedItems += 1;
      }

      const { data: refreshed } = await supabase
        .from("quote_items")
        .select("total_price")
        .eq("quote_id", quoteId);
      const rawSubtotal = (refreshed ?? []).reduce(
        (s, r) => s + (Number(r.total_price) || 0),
        0,
      );
      const { data: quote } = await supabase
        .from("quotes")
        .select("tax_rate, guest_count")
        .eq("id", quoteId)
        .maybeSingle();
      const taxRate = Number(quote?.tax_rate) || 0;
      const guests = Math.max(Number(quote?.guest_count) || 1, 1);
      const rawPerGuest = rawSubtotal / guests;
      const roundedPerGuest = rawPerGuest > 0 ? Math.ceil(rawPerGuest / 5) * 5 : 0;
      const subtotal = Math.round(roundedPerGuest * guests * 100) / 100;
      const total = Math.round(subtotal * (1 + taxRate) * 100) / 100;
      const { error: qErr } = await supabase
        .from("quotes")
        .update({ subtotal, total })
        .eq("id", quoteId);
      if (qErr) throw qErr;

      recalc = {
        quoteId,
        updatedItems,
        subtotal,
        total,
        perGuest: roundedPerGuest,
        markup,
      };
    }

    return {
      success: true,
      updated: updates,
      skipped,
      recalc,
    };
  });
