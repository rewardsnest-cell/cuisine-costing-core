import { createServerFn } from "@tanstack/react-start";
import { aiPost, AiGatewayError } from "./_ai-gateway";

export const processPurchaseOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { imageBase64: string }) => {
    if (!input?.imageBase64) throw new Error("imageBase64 is required");
    return input;
  })
  .handler(async ({ data }) => {
    try {
      const resp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You extract purchase order line items from photos. Be precise with numbers.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract every line item from this purchase order / invoice / receipt. For each: name, quantity, unit (lb, each, oz, case, kg, etc.), unit_price, total_price. Also extract the vendor/supplier name if visible.",
              },
              { type: "image_url", image_url: { url: data.imageBase64 } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_po",
              description: "Extract structured PO line items",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string", description: "Vendor or supplier name if visible" },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
                        unit_price: { type: "number" },
                        total_price: { type: "number" },
                      },
                      required: ["name", "quantity", "unit", "unit_price", "total_price"],
                    },
                  },
                },
                required: ["line_items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_po" } },
      });
      const aiData = await resp.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned");
      const extracted = JSON.parse(toolCall.function.arguments);
      return {
        success: true,
        vendor_name: extracted.vendor_name || null,
        line_items: extracted.line_items || [],
      };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { success: false, error: e.message, status: e.status, line_items: [], vendor_name: null };
      }
      throw e;
    }
  });
