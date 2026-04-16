import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl, receiptId } = await req.json();
    if (!imageUrl || !receiptId) {
      return new Response(JSON.stringify({ error: "imageUrl and receiptId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Call AI to extract line items from receipt image
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a receipt OCR specialist. Extract line items from receipt images. Return structured data using the extract_line_items tool.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all line items from this receipt image. For each item, extract the item name, quantity, unit (e.g. lb, each, oz, case), unit price, and total price. Also extract the receipt total amount.",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_line_items",
              description: "Extract structured line items from a receipt",
              parameters: {
                type: "object",
                properties: {
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item_name: { type: "string", description: "Name of the item" },
                        quantity: { type: "number", description: "Quantity purchased" },
                        unit: { type: "string", description: "Unit of measure (lb, each, oz, case, etc.)" },
                        unit_price: { type: "number", description: "Price per unit" },
                        total_price: { type: "number", description: "Total price for this line" },
                      },
                      required: ["item_name", "quantity", "unit", "unit_price", "total_price"],
                    },
                  },
                  total_amount: { type: "number", description: "Receipt total amount" },
                  raw_text: { type: "string", description: "Raw text from the receipt" },
                },
                required: ["line_items", "total_amount"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_line_items" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("AI processing failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned from AI");

    const extracted = JSON.parse(toolCall.function.arguments);

    // Now try to match line items to inventory items
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fetch inventory items for matching
    const invResp = await fetch(`${SUPABASE_URL}/rest/v1/inventory_items?select=id,name,current_stock,average_cost_per_unit,unit`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const inventoryItems = await invResp.json();

    // Match line items to inventory by name similarity
    const enrichedLineItems = (extracted.line_items || []).map((item: any) => {
      const nameLower = item.item_name.toLowerCase();
      const match = inventoryItems.find((inv: any) =>
        inv.name.toLowerCase().includes(nameLower) || nameLower.includes(inv.name.toLowerCase())
      );
      return {
        ...item,
        matched_inventory_id: match?.id || null,
        matched_inventory_name: match?.name || null,
      };
    });

    // Update the receipt record
    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/receipts?id=eq.${receiptId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        extracted_line_items: enrichedLineItems,
        total_amount: extracted.total_amount || 0,
        raw_ocr_text: extracted.raw_text || "",
        status: "reviewed",
      }),
    });

    return new Response(
      JSON.stringify({
        success: true,
        line_items: enrichedLineItems,
        total_amount: extracted.total_amount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-receipt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
