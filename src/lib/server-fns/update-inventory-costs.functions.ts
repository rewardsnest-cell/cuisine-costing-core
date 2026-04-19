import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateInventoryCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { receiptId: string }) => {
    if (!input?.receiptId) throw new Error("receiptId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: receipt, error: receiptErr } = await sb
      .from("receipts")
      .select("*")
      .eq("id", data.receiptId)
      .maybeSingle();
    if (receiptErr || !receipt) throw new Error(receiptErr?.message || "Receipt not found");

    const supplierId: string | null = receipt.supplier_id ?? null;
    const observedAt = receipt.receipt_date
      ? new Date(receipt.receipt_date).toISOString()
      : new Date().toISOString();
    const lineItems = (receipt.extracted_line_items as Array<Record<string, unknown>>) || [];
    const updates: { name: string; oldCost: number; newCost: number }[] = [];

    for (const item of lineItems) {
      const matchedId = item?.matched_inventory_id as string | undefined;
      if (!matchedId) continue;

      const { data: inv } = await sb
        .from("inventory_items")
        .select("*")
        .eq("id", matchedId)
        .maybeSingle();
      if (!inv) continue;

      const oldStock = Number(inv.current_stock);
      const oldAvgCost = Number(inv.average_cost_per_unit);
      const newQty = Number(item.quantity);
      const newUnitPrice = Number(item.unit_price);

      const newAvgCost =
        oldStock + newQty > 0
          ? (oldStock * oldAvgCost + newQty * newUnitPrice) / (oldStock + newQty)
          : newUnitPrice;

      await sb
        .from("inventory_items")
        .update({
          current_stock: oldStock + newQty,
          average_cost_per_unit: Math.round(newAvgCost * 100) / 100,
          last_receipt_cost: newUnitPrice,
        })
        .eq("id", matchedId);

      await sb.from("price_history").insert({
        inventory_item_id: matchedId,
        source: "receipt",
        source_id: data.receiptId,
        supplier_id: supplierId,
        unit_price: newUnitPrice,
        unit: (item.unit as string) || null,
        observed_at: observedAt,
      });

      updates.push({
        name: inv.name,
        oldCost: oldAvgCost,
        newCost: Math.round(newAvgCost * 100) / 100,
      });
    }

    await sb
      .from("receipts")
      .update({ status: "processed" })
      .eq("id", data.receiptId);

    return { success: true, updates };
  });
