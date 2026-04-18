import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { flyerId } = body;
    // Accept either a single imageUrl (back-compat) or imageUrls (multi-page)
    let imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((u: any) => typeof u === "string" && u.length > 0)
      : body.imageUrl
        ? [body.imageUrl]
        : [];

    if (!flyerId) {
      return new Response(JSON.stringify({ error: "flyerId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    // If no imageUrls provided, fetch every persisted page for this flyer
    if (imageUrls.length === 0) {
      const pagesResp = await fetch(
        `${SUPABASE_URL}/rest/v1/sale_flyer_pages?sale_flyer_id=eq.${flyerId}&select=image_url,page_number&order=page_number.asc`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
      );
      const pages = await pagesResp.json();
      imageUrls = (pages || []).map((p: any) => p.image_url).filter(Boolean);
    }

    if (imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: "No pages found for this flyer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build a single multimodal request that includes ALL pages so the AI
    // can merge items across pages and pick a single sale period.
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
                  title: { type: "string", description: "Short title for this flyer" },
                  sale_start_date: { type: "string", description: "YYYY-MM-DD" },
                  sale_end_date: { type: "string", description: "YYYY-MM-DD" },
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    // Fetch inventory for matching
    const invResp = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory_items?select=id,name,unit`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const inventoryItems = await invResp.json();

    const matchInv = (name: string) => {
      const n = name.toLowerCase();
      return inventoryItems.find(
        (inv: any) => inv.name.toLowerCase().includes(n) || n.includes(inv.name.toLowerCase()),
      );
    };

    // Replace existing items for this flyer (re-extract is idempotent)
    await fetch(`${SUPABASE_URL}/rest/v1/sale_flyer_items?sale_flyer_id=eq.${flyerId}`, {
      method: "DELETE",
      headers: sbHeaders,
    });

    // Insert flyer items
    const itemsToInsert = (extracted.items || []).map((it: any) => {
      const matched = matchInv(it.name || "");
      return {
        sale_flyer_id: flyerId,
        inventory_item_id: matched?.id || null,
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
    });

    if (itemsToInsert.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/sale_flyer_items`, {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify(itemsToInsert),
      });
    }

    // Update flyer record
    const flyerUpdate: any = {
      raw_ocr_text: extracted.raw_text || null,
      status: "processed",
      processed_at: new Date().toISOString(),
    };
    if (extracted.title) flyerUpdate.title = extracted.title;
    if (extracted.sale_start_date) flyerUpdate.sale_start_date = extracted.sale_start_date;
    if (extracted.sale_end_date) flyerUpdate.sale_end_date = extracted.sale_end_date;

    await fetch(`${SUPABASE_URL}/rest/v1/sale_flyers?id=eq.${flyerId}`, {
      method: "PATCH",
      headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(flyerUpdate),
    });

    return new Response(
      JSON.stringify({
        success: true,
        pages_processed: imageUrls.length,
        items_count: itemsToInsert.length,
        matched_count: itemsToInsert.filter((i: any) => i.inventory_item_id).length,
        sale_start_date: extracted.sale_start_date,
        sale_end_date: extracted.sale_end_date,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("process-sale-flyer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
