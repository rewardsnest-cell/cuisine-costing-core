// Quote Assistant — streams from Lovable AI Gateway with tool calling for structured updates.
// Server route (NOT a server function) so we can return a Response with SSE.
import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `You are a deeply curious, expert catering concierge — think of yourself as part chef, part event planner, part interviewer. Your superpower is asking thoughtful, probing questions that uncover what the client REALLY wants, even things they hadn't thought to mention. Ask ONE focused question at a time, but make every question count.

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

# Your Inquisitive Style

- Be genuinely curious. Ask "why" and "tell me more" when it helps you design a better menu.
- Layer follow-ups: when they say "Italian," ask northern vs southern, rustic vs refined, family recipes vs modern twists.
- Surface the WHY behind the event: "What's the story behind this celebration?" "What do you want guests talking about the next day?"
- Probe sensory details: textures, aromas, presentation style, plate colors, signature moments.
- Ask about guest demographics: age range, adventurous eaters or comfort-food crowd, cultural backgrounds, dietary mix.
- Explore the moment: time of day, indoor/outdoor, season, weather contingencies, lighting, music vibe.
- Dig into preferences with concrete either/or choices: "ribeye or filet?", "crispy or fall-off-the-bone?", "bright & citrusy or rich & buttery?".
- Ask about dislikes too — what they want to AVOID is as useful as what they love.
- For bar add-ons: probe deeply — favorite cocktails, signature drink ideas, beer (IPA/lager/sour), wine (varietals, regions, sweet/dry), spirits brands, non-alcoholic options.
- Ask about meaningful details: family recipes to honor, cultural traditions, dishes that remind them of someone, foods that tell their story.

# Conversation Flow

1. Acknowledge any prefilled fields warmly and reference them specifically.
2. Get missing basics: event type, date, guest count, menu style — but pair each with a curious follow-up ("birthday — milestone year? what makes this one special?").
3. Probe granular preferences deeply: cuts, cooking methods, cuisines, spice, textures, presentation, vibe.
4. Explore guest experience: dietary mix, adventurousness, cultural notes, what should feel familiar vs surprising.
5. If bar add-on: go deep on alcohol preferences and signature drinks.
6. Cover allergies, sides, addons, service style, tier — always with a "why" or "what matters most" lens.
7. Collect contact (name, email, venue) — ask about the venue too (vibe, kitchen access, outdoor/indoor).
8. When you have ALL basics + contact, tell the user they can hit "Review & Submit" on the right panel.

# Tool Use

Whenever you learn ANY new info, IMMEDIATELY call update_quote_draft with the fields you learned. You can call it on every turn. Use only the enum values listed above for style, serviceStyle, tier. Use array fields for proteins, allergies, extras, addons. Put ALL the rich granular details (cuts, cooking methods, cuisine lean, spice level, vibe, guest notes, story, alcohol details, dislikes, presentation notes) in the preferences object — capture everything you learn.

Keep responses warm and conversational (2-4 sentences + ONE thoughtful question). Show you're listening by referencing what they just said. Use markdown sparingly.`;

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

async function callGateway(body: unknown, apiKey: string) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function handlePost({ request }: { request: Request }) {
  try {
    const { messages, prefilled, context } = (await request.json()) as {
      messages: Array<{ role: string; content: string }>;
      prefilled?: unknown;
      context?: string;
    };
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const weddingAddendum = context === "wedding"
      ? `\n\n# Wedding Context\nThe client arrived from the wedding catering page. Treat this as a WEDDING inquiry from the start. Set eventType to "Wedding" via the tool. Lead with wedding-specific questions: wedding date, venue (or area in/around Aurora, Ohio / NE Ohio), guest count, ceremony + reception flow, cocktail hour vs reception meal, plated/family/buffet preference, signature dishes that mean something to the couple, dietary mix among guests, tasting interest, and the overall vibe of the day. Be especially calm, warm, and reassuring — emphasize stress-free service. Avoid corporate-event framing.`
      : "";

    const systemContent =
      SYSTEM_PROMPT +
      weddingAddendum +
      (prefilled
        ? `\n\n# Prefilled draft from the user (already chose these — acknowledge and skip questions for these):\n${JSON.stringify(prefilled, null, 2)}`
        : "");

    const baseMessages = [{ role: "system", content: systemContent }, ...messages];

    // Step 1: non-streaming call to capture any tool calls cleanly
    const firstResp = await callGateway(
      { model: "google/gemini-3-flash-preview", messages: baseMessages, tools, stream: false },
      LOVABLE_API_KEY,
    );

    if (!firstResp.ok) {
      if (firstResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }), {
          status: 429, headers: { "Content-Type": "application/json" },
        });
      }
      if (firstResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }), {
          status: 402, headers: { "Content-Type": "application/json" },
        });
      }
      const text = await firstResp.text();
      console.error("AI gateway error (first):", firstResp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const firstData = await firstResp.json();
    const assistantMsg = firstData.choices?.[0]?.message ?? {};
    const toolCalls = assistantMsg.tool_calls as Array<any> | undefined;
    const firstContent: string = assistantMsg.content ?? "";

    const encoder = new TextEncoder();
    const writeSSE = (controller: ReadableStreamDefaultController, payload: unknown) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    const emitTextAsDeltas = (controller: ReadableStreamDefaultController, text: string) => {
      const chunkSize = 40;
      for (let i = 0; i < text.length; i += chunkSize) {
        writeSSE(controller, { choices: [{ delta: { content: text.slice(i, i + chunkSize) } }] });
      }
    };

    const emitToolCalls = (controller: ReadableStreamDefaultController, calls: Array<any>) => {
      calls.forEach((tc, idx) => {
        writeSSE(controller, {
          choices: [{
            delta: {
              tool_calls: [{
                index: idx,
                id: tc.id,
                type: "function",
                function: { name: tc.function?.name, arguments: tc.function?.arguments ?? "" },
              }],
            },
          }],
        });
      });
    };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (toolCalls && toolCalls.length > 0) {
            emitToolCalls(controller, toolCalls);
          }

          if (firstContent && firstContent.trim()) {
            emitTextAsDeltas(controller, firstContent);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          if (toolCalls && toolCalls.length > 0) {
            const toolResultMessages = toolCalls.map((tc) => ({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: true }),
            }));

            const followResp = await callGateway(
              {
                model: "google/gemini-3-flash-preview",
                messages: [
                  ...baseMessages,
                  { role: "assistant", content: firstContent || "", tool_calls: toolCalls },
                  ...toolResultMessages,
                ],
                tools,
                stream: true,
              },
              LOVABLE_API_KEY,
            );

            if (!followResp.ok || !followResp.body) {
              const t = await followResp.text().catch(() => "");
              console.error("Follow-up gateway error:", followResp.status, t);
              emitTextAsDeltas(controller, "Got it! What's next?");
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            const reader = followResp.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
            return;
          }

          emitTextAsDeltas(controller, "Sorry, I didn't catch that. Could you tell me a bit more?");
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("stream error:", err);
          try {
            emitTextAsDeltas(controller, "Something went wrong. Please try again.");
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch {
            // ignore
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("quote-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/quote-assistant")({
  server: {
    handlers: {
      POST: handlePost,
    },
  },
});
