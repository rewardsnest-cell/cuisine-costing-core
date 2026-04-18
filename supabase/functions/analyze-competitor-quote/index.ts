// Analyze a competitor quote (image or PDF page screenshot) using Lovable AI vision
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are an expert catering pricing analyst. The user uploads a competitor's quote/proposal (image or screenshot). Extract all relevant pricing information so we can build a competitive counter-quote.

Return ONLY valid JSON with this shape:
{
  "competitorName": string | null,
  "clientName": string | null,
  "eventType": string | null,
  "eventDate": string | null,
  "guestCount": number | null,
  "perGuestPrice": number | null,
  "subtotal": number | null,
  "taxes": number | null,
  "gratuity": number | null,
  "total": number | null,
  "lineItems": [{ "name": string, "qty": number | null, "unitPrice": number | null, "total": number | null, "category": string | null }],
  "menuHighlights": [string],
  "serviceStyle": string | null,
  "addons": [string],
  "notes": string,
  "ourSuggestedPrice": { "perGuest": number, "total": number, "rationale": string }
}

For "ourSuggestedPrice", suggest a competitive price that beats the competitor by 5-12% while remaining profitable (use industry-standard 30% food cost margin). If you cannot detect prices, set numeric fields to null.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) throw new Error("imageBase64 is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract pricing from this competitor catering quote. Return JSON only." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("AI gateway error:", resp.status, text);
      if (resp.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit reached. Please wait and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (resp.status === 402)
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      throw new Error(`AI error ${resp.status}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-competitor-quote error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
