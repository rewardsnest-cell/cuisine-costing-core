// Quote Assistant — streams from Lovable AI Gateway with tool calling for structured updates
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a friendly, expert catering concierge helping a client design their event menu. Your job is to ask short, focused questions ONE AT A TIME — never bombard the user.

# Menu Catalog

Menu styles: meat, seafood, vegetarian, mixed
Proteins by style:
- meat: Chicken, Beef, Pork, Lamb
- seafood: Fish, Shrimp, Crab, Lobster
- vegetarian: Tofu, Mushroom, Eggplant, Cauliflower
- mixed: Chicken, Beef, Fish, Tofu

Service styles: buffet, plated, family, cocktail
Extras (id): appetizers, salad, soup, bread, dessert, beverages, coffee
Add-ons (id): bar_basic, bar_premium, linens, florals, staff, equipment
Tiers: silver (standard), gold (premium), platinum (luxury)
Allergies: Gluten, Dairy, Nuts, Shellfish, Soy, Eggs

# Conversation Flow

1. Acknowledge any prefilled fields warmly (the user may have already started in the basic builder).
2. Ask about MISSING basics first: event type, date, guest count, menu style.
3. Then probe granular preferences: specific cuts (e.g. "ribeye vs filet?"), favorite veggies, cuisine lean (Mediterranean, Italian, Asian-fusion), spice tolerance, vibe.
4. If a bar add-on is selected, dig into alcohol: beer style, wine (red/white/sparkling), spirits, signature cocktail.
5. Ask about allergies, sides, addons, service style, tier.
6. Finally collect contact: name, email, venue.
7. When you have ALL basics + contact, tell the user they can hit "Review & Submit" on the right panel.

# Tool Use

Whenever you learn ANY new info, IMMEDIATELY call update_quote_draft with the fields you learned. You can call it on every turn. Use only the enum values listed above for style, serviceStyle, tier. Use array fields for proteins, allergies, extras, addons. Put granular details (specific cuts, alcohol brands, vibe, spice level) in the preferences object.

Keep responses warm but BRIEF (1-3 sentences + ONE question). Use markdown sparingly.`;

const tools = [
  {
    type: "function",
    function: {
      name: "update_quote_draft",
      description: "Update the quote draft with any fields learned from the conversation. Call whenever new info is captured.",
      parameters: {
        type: "object",
        properties: {
          style: { type: "string", enum: ["meat", "seafood", "vegetarian", "mixed"] },
          proteins: { type: "array", items: { type: "string" } },
          allergies: { type: "array", items: { type: "string" } },
          serviceStyle: { type: "string", enum: ["buffet", "plated", "family", "cocktail"] },
          extras: { type: "array", items: { type: "string" } },
          addons: { type: "array", items: { type: "string" } },
          tier: { type: "string", enum: ["silver", "gold", "platinum"] },
          guestCount: { type: "number" },
          eventDate: { type: "string", description: "YYYY-MM-DD" },
          eventType: { type: "string" },
          clientName: { type: "string" },
          clientEmail: { type: "string" },
          locationName: { type: "string" },
          locationAddress: { type: "string" },
          preferences: {
            type: "object",
            properties: {
              proteinDetails: { type: "string" },
              vegetableNotes: { type: "string" },
              cuisineLean: { type: "string" },
              spiceLevel: { type: "string" },
              vibe: { type: "string" },
              notes: { type: "string" },
              alcohol: {
                type: "object",
                properties: {
                  beer: { type: "string" },
                  wine: { type: "string" },
                  spirits: { type: "string" },
                  signatureCocktail: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, prefilled } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemContent =
      SYSTEM_PROMPT +
      (prefilled
        ? `\n\n# Prefilled draft from the user (already chose these — acknowledge and skip questions for these):\n${JSON.stringify(prefilled, null, 2)}`
        : "");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemContent }, ...messages],
        tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("quote-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
