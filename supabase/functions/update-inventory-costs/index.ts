import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { receiptId } = await req.json();
    if (!receiptId) {
      return new Response(JSON.stringify({ error: "receiptId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    // Fetch the receipt
    const receiptResp = await fetch(`${SUPABASE_URL}/rest/v1/receipts?id=eq.${receiptId}&select=*`, { headers });
    const receipts = await receiptResp.json();
    if (!receipts.length) throw new Error("Receipt not found");

    const receipt = receipts[0];
    const lineItems = receipt.extracted_line_items || [];
    const updates: { name: string; oldCost: number; newCost: number }[] = [];

    for (const item of lineItems) {
      if (!item.matched_inventory_id) continue;

      // Fetch current inventory item
      const invResp = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory_items?id=eq.${item.matched_inventory_id}&select=*`,
        { headers }
      );
      const invItems = await invResp.json();
      if (!invItems.length) continue;

      const inv = invItems[0];
      const oldStock = Number(inv.current_stock);
      const oldAvgCost = Number(inv.average_cost_per_unit);
      const newQty = Number(item.quantity);
      const newUnitPrice = Number(item.unit_price);

      // Weighted moving average formula
      const newAvgCost =
        oldStock + newQty > 0
          ? (oldStock * oldAvgCost + newQty * newUnitPrice) / (oldStock + newQty)
          : newUnitPrice;

      // Update inventory
      await fetch(`${SUPABASE_URL}/rest/v1/inventory_items?id=eq.${item.matched_inventory_id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          current_stock: oldStock + newQty,
          average_cost_per_unit: Math.round(newAvgCost * 100) / 100,
          last_receipt_cost: newUnitPrice,
        }),
      });

      updates.push({
        name: inv.name,
        oldCost: oldAvgCost,
        newCost: Math.round(newAvgCost * 100) / 100,
      });
    }

    // Mark receipt as processed
    await fetch(`${SUPABASE_URL}/rest/v1/receipts?id=eq.${receiptId}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "processed" }),
    });

    return new Response(
      JSON.stringify({ success: true, updates }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("update-inventory-costs error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
