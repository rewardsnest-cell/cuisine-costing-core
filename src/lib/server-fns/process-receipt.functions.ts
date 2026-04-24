import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPost, AiGatewayError } from "./_ai-gateway";

type RawLine = {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
};

export const processReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageUrl: string; receiptId: string; rerun?: boolean }) => {
    if (!input?.imageUrl || !input?.receiptId) throw new Error("imageUrl and receiptId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // Snapshot previous OCR data for side-by-side comparison on re-runs
    let previous: { raw_ocr_text: string | null; line_items: RawLine[] } | null = null;
    if (data.rerun) {
      const { data: prior } = await sb
        .from("receipts")
        .select("raw_ocr_text, extracted_line_items")
        .eq("id", data.receiptId)
        .maybeSingle();
      if (prior) {
        previous = {
          raw_ocr_text: (prior as any).raw_ocr_text ?? null,
          line_items: Array.isArray((prior as any).extracted_line_items)
            ? ((prior as any).extracted_line_items as RawLine[])
            : [],
        };
      }
    }

    try {
      const aiResp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a receipt OCR specialist. Extract line items from receipt images. Return structured data using the extract_line_items tool.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all line items from this receipt image. For each item, extract the item name, quantity, unit (e.g. lb, each, oz, case), unit price, and total price. Also extract the receipt total amount.",
              },
              { type: "image_url", image_url: { url: data.imageUrl } },
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
                        item_name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
                        unit_price: { type: "number" },
                        total_price: { type: "number" },
                      },
                      required: ["item_name", "quantity", "unit", "unit_price", "total_price"],
                    },
                  },
                  total_amount: { type: "number" },
                  raw_text: { type: "string" },
                },
                required: ["line_items", "total_amount"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_line_items" } },
      });

      const aiData = await aiResp.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned from AI");
      const extracted = JSON.parse(toolCall.function.arguments) as {
        line_items: RawLine[];
        total_amount: number;
        raw_text?: string;
      };

      // Match each line item using the find_ingredient_matches RPC
      // (which already prefers synonyms → reference table → fuzzy inventory match).
      const enriched = await Promise.all(
        (extracted.line_items || []).map(async (item) => {
          let matched_inventory_id: string | null = null;
          let matched_inventory_name: string | null = null;
          let match_source: string | null = null;
          let match_score: number | null = null;

          try {
            const { data: matches } = await sb.rpc("find_ingredient_matches", {
              _name: item.item_name,
              _limit: 1,
            });
            const top = matches?.[0];
            if (top?.inventory_item_id) {
              matched_inventory_id = top.inventory_item_id;
              matched_inventory_name = top.inventory_name;
              match_source = top.source;
              match_score = top.similarity;
            }
          } catch (err) {
            console.warn(`find_ingredient_matches failed for "${item.item_name}":`, err);
          }

          return {
            ...item,
            matched_inventory_id,
            matched_inventory_name,
            match_source,
            match_score,
          };
        }),
      );

      await sb
        .from("receipts")
        .update({
          extracted_line_items: enriched,
          total_amount: extracted.total_amount || 0,
          raw_ocr_text: extracted.raw_text || "",
          status: "reviewed",
        })
        .eq("id", data.receiptId);

      return {
        success: true,
        line_items: enriched,
        total_amount: extracted.total_amount,
      };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { success: false, error: e.message, status: e.status, line_items: [], total_amount: 0 };
      }
      throw e;
    }
  });
