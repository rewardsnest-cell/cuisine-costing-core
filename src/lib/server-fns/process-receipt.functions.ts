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

    // Load configurable confidence threshold (0..1). Matches below this score
    // are auto-queued for manual review (match dropped, flagged with reason).
    let confidenceThreshold = 0.6;
    try {
      const { data: kv } = await sb
        .from("app_kv")
        .select("value")
        .eq("key", "receipt_match_confidence_threshold")
        .maybeSingle();
      const parsed = parseFloat((kv as any)?.value ?? "");
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        confidenceThreshold = parsed;
      }
    } catch {
      // ignore — fall back to default
    }

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
          let needs_review = false;
          let review_reason: string | null = null;

          try {
            const { data: matches } = await sb.rpc("find_ingredient_matches", {
              _name: item.item_name,
              _limit: 1,
            });
            const top = matches?.[0];
            if (top?.inventory_item_id) {
              const score = typeof top.similarity === "number" ? top.similarity : null;
              match_source = top.source;
              match_score = score;
              // Auto-queue for manual review when confidence is below threshold.
              // We keep the suggested match name visible but DO NOT auto-link the
              // inventory id, so apply-costs cannot mutate inventory until a
              // human approves it in the review modal.
              if (score !== null && score < confidenceThreshold) {
                matched_inventory_id = null;
                matched_inventory_name = top.inventory_name;
                needs_review = true;
                review_reason = `Low confidence (${(score * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%)`;
              } else {
                matched_inventory_id = top.inventory_item_id;
                matched_inventory_name = top.inventory_name;
              }
            } else {
              needs_review = true;
              review_reason = "No inventory match found";
            }
          } catch (err) {
            console.warn(`find_ingredient_matches failed for "${item.item_name}":`, err);
            needs_review = true;
            review_reason = "Match lookup failed";
          }

          return {
            ...item,
            matched_inventory_id,
            matched_inventory_name,
            match_source,
            match_score,
            needs_review,
            review_reason,
          };
        }),
      );

      const flaggedCount = enriched.filter((it) => it.needs_review).length;
      const nextStatus = flaggedCount > 0 ? "needs_review" : "reviewed";

      await sb
        .from("receipts")
        .update({
          extracted_line_items: enriched,
          total_amount: extracted.total_amount || 0,
          raw_ocr_text: extracted.raw_text || "",
          status: nextStatus,
        })
        .eq("id", data.receiptId);

      return {
        success: true,
        line_items: enriched,
        total_amount: extracted.total_amount,
        raw_ocr_text: extracted.raw_text || "",
        previous,
      };
    } catch (e) {
      // Mark receipt as failed so the UI can surface a Re-run OCR action
      try {
        await sb
          .from("receipts")
          .update({ status: "failed" })
          .eq("id", data.receiptId);
      } catch {
        // ignore secondary failure
      }
      if (e instanceof AiGatewayError) {
        return {
          success: false,
          error: e.message,
          status: e.status,
          line_items: [],
          total_amount: 0,
          raw_ocr_text: "",
          previous,
        };
      }
      throw e;
    }
  });
