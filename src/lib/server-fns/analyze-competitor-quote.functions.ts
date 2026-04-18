import { createServerFn } from "@tanstack/react-start";
import { aiPost, AiGatewayError } from "./_ai-gateway";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

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

export const analyzeCompetitorQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { imageBase64: string; mimeType?: string }) => {
    if (!input?.imageBase64) throw new Error("imageBase64 is required");
    return input;
  })
  .handler(async ({ data }) => {
    const dataUrl = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:${data.mimeType || "image/jpeg"};base64,${data.imageBase64}`;

    try {
      const resp = await aiPost({
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
      });
      const aiData = await resp.json();
      const content = aiData.choices?.[0]?.message?.content ?? "{}";
      let parsed: Json;
      try { parsed = JSON.parse(content) as Json; } catch { parsed = { raw: content }; }
      return { result: parsed };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { error: e.message, status: e.status, result: null };
      }
      throw e;
    }
  });
