import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aiPost, AiGatewayError } from "./_ai-gateway";

export const processSaleFlyer = createServerFn({ method: "POST" })
  .inputValidator((input: { flyerId: string; imageUrls?: string[]; imageUrl?: string }) => {
    if (!input?.flyerId) throw new Error("flyerId required");
    return input;
  })
  .handler(async ({ data }) => {
    let imageUrls: string[] = Array.isArray(data.imageUrls)
      ? data.imageUrls.filter((u) => typeof u === "string" && u.length > 0)
      : data.imageUrl
        ? [data.imageUrl]
        : [];

    if (imageUrls.length === 0) {
      const { data: pages } = await supabaseAdmin
        .from("sale_flyer_pages")
        .select("image_url,page_number")
        .eq("sale_flyer_id", data.flyerId)
        .order("page_number", { ascending: true });
      imageUrls = (pages || []).map((p) => p.image_url).filter(Boolean);
    }

    if (imageUrls.length === 0) {
      return { success: false, error: "No pages found for this flyer" };
    }

    const userContent: any[] = [
      {
        type: "text",
        text:
          `Extract every product across ${imageUrls.length} flyer page${imageUrls.length === 1 ? "" : "s"}. ` +
          "For each item include: name, brand (if shown), pack_size (e.g. '12 oz', '5 lb case'), unit (each/lb/oz/case), sale_price, regular_price (if shown), and savings amount. " +
          "Deduplicate items that appear on multiple pages. " +
          "Also extract sale_start_date and sale_end_date in YYYY-MM-DD format if any page shows a sale period, plus a short title and any raw text.",
      },
      ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    let extracted: any;
    try {
      const aiResp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a sale flyer extraction specialist. Read supplier sale flyers (which may span multiple pages) and extract every advertised item with its sale price, regular price, brand, pack size and unit. Also extract the sale period start and end dates if visible. Return data via the extract_sale_flyer tool.",
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_sale_flyer",
              description: "Extract structured items and sale period from a (possibly multi-page) sale flyer",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  sale_start_date: { type: "string" },
                  sale_end_date: { type: "string" },
                  raw_text: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        brand: { type: "string" },
                        pack_size: { type: "string" },
                        unit: { type: "string" },
                        sale_price: { type: "number" },
                        regular_price: { type: "number" },
                        savings: { type: "number" },
                      },
                      required: ["name", "sale_price"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_sale_flyer" } },
      });
      const aiData = await aiResp.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned from AI");
      extracted = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { success: false, error: e.message, status: e.status };
      }
      throw e;
    }

    // Replace items for this flyer
    await supabaseAdmin.from("sale_flyer_items").delete().eq("sale_flyer_id", data.flyerId);

    // Match each item using the find_ingredient_matches RPC
    const itemsToInsert = await Promise.all(
      (extracted.items || []).map(async (it: any) => {
        let matchedId: string | null = null;
        try {
          const { data: matches } = await supabaseAdmin.rpc("find_ingredient_matches", {
            _name: it.name || "",
            _limit: 1,
          });
          if (matches?.[0]?.inventory_item_id) matchedId = matches[0].inventory_item_id;
        } catch (err) {
          console.warn(`find_ingredient_matches failed for "${it.name}":`, err);
        }
        return {
          sale_flyer_id: data.flyerId,
          inventory_item_id: matchedId,
          name: it.name,
          brand: it.brand || null,
          pack_size: it.pack_size || null,
          unit: it.unit || null,
          sale_price: it.sale_price ?? null,
          regular_price: it.regular_price ?? null,
          savings:
            it.savings ??
            (typeof it.regular_price === "number" && typeof it.sale_price === "number"
              ? it.regular_price - it.sale_price
              : null),
        };
      }),
    );

    if (itemsToInsert.length > 0) {
      await supabaseAdmin.from("sale_flyer_items").insert(itemsToInsert);
    }

    const flyerUpdate: any = {
      raw_ocr_text: extracted.raw_text || null,
      status: "processed",
      processed_at: new Date().toISOString(),
    };
    if (extracted.title) flyerUpdate.title = extracted.title;
    if (extracted.sale_start_date) flyerUpdate.sale_start_date = extracted.sale_start_date;
    if (extracted.sale_end_date) flyerUpdate.sale_end_date = extracted.sale_end_date;

    await supabaseAdmin.from("sale_flyers").update(flyerUpdate).eq("id", data.flyerId);

    return {
      success: true,
      pages_processed: imageUrls.length,
      items_count: itemsToInsert.length,
      matched_count: itemsToInsert.filter((i) => i.inventory_item_id).length,
      sale_start_date: extracted.sale_start_date,
      sale_end_date: extracted.sale_end_date,
    };
  });
