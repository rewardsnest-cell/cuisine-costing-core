import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  leadId: z.string().uuid(),
  channels: z.array(z.enum(["email", "sms", "voicemail"])).min(1),
  tone: z.enum(["warm", "professional", "casual", "concise"]).default("warm"),
  goal: z.enum(["intro", "follow_up", "re_engage", "book_meeting", "menu_share"]).default("intro"),
  senderName: z.string().max(120).optional(),
  companyName: z.string().max(120).optional(),
  extraContext: z.string().max(2000).optional(),
});

export type GenerateDraftInput = z.infer<typeof inputSchema>;

export type DraftResult = {
  email?: { subject: string; body: string };
  sms?: { body: string };
  voicemail?: { body: string };
};

export const generateOutreachDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<DraftResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    );

    const { data: lead, error } = await supabase
      .from("leads")
      .select(
        "name,email,company,organization_type,role_department,address_city,address_state,distance_miles,catering_use_cases,event_type,event_date,guest_count,venue,est_budget,priority,status,tags,notes,last_channel,last_contact_date,next_follow_up_date",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead not found");

    const sender = data.senderName ?? "the team";
    const company = data.companyName ?? "VPS Finest Catering";

    const goalMap: Record<string, string> = {
      intro: "first introduction — warmly introduce yourself and offer to help with their catering needs",
      follow_up: "polite follow-up after a previous touchpoint, referencing prior contact when possible",
      re_engage: "re-engage a contact that's gone quiet — be friendly, low pressure",
      book_meeting: "propose a quick 10-15 minute call or visit to discuss their needs",
      menu_share: "offer to share menus and tasting options tailored to their typical events",
    };

    const toneMap: Record<string, string> = {
      warm: "warm, personal, conversational",
      professional: "polished and professional but still human",
      casual: "casual and friendly, like emailing a colleague",
      concise: "very short and to-the-point",
    };

    const contactProfile = {
      name: lead.name ?? null,
      company: lead.company ?? null,
      organization_type: lead.organization_type ?? null,
      role: lead.role_department ?? null,
      city: lead.address_city ?? null,
      state: lead.address_state ?? null,
      distance_miles: lead.distance_miles ?? null,
      catering_use_cases: lead.catering_use_cases ?? [],
      event_type: lead.event_type ?? null,
      event_date: lead.event_date ?? null,
      guest_count: lead.guest_count ?? null,
      venue: lead.venue ?? null,
      tags: lead.tags ?? [],
      notes: lead.notes ?? null,
      previous_channel: lead.last_channel ?? null,
      last_contact_date: lead.last_contact_date ?? null,
    };

    const channelInstructions = data.channels
      .map((c) => {
        if (c === "email") {
          return `- "email": JSON object with "subject" (max ~70 chars, no emojis, no clickbait) and "body" (3-6 short paragraphs, plain text, includes a clear next step, signs off as ${sender} from ${company}). No markdown, no HTML.`;
        }
        if (c === "sms") {
          return `- "sms": JSON object with "body" (one short message, max 320 chars, friendly, ends with a question or clear next step, signs off as ${sender} from ${company}).`;
        }
        return `- "voicemail": JSON object with "body" (a 20-30 second voicemail script, plain text, conversational, includes name + company + reason for call + callback ask).`;
      })
      .join("\n");

    const userPrompt = `You are drafting personalized outreach for a local catering sales rep.

Sender: ${sender} at ${company}
Tone: ${toneMap[data.tone]}
Goal: ${goalMap[data.goal]}

Contact profile (JSON):
${JSON.stringify(contactProfile, null, 2)}

${data.extraContext ? `Additional context from the rep:\n${data.extraContext}\n` : ""}
Personalization rules:
- Reference the contact's category/organization type and 1-2 specific use cases naturally.
- If a city is known, mention being local / nearby; if distance_miles <= 15, lean into "right around the corner".
- Never invent prices, menus, dates, or guest counts that aren't in the profile.
- Never use the words "leveraging", "synergies", "circle back".
- Don't use emojis.
- If name is missing, use a friendly greeting that doesn't require a name (e.g. "Hi there,").

Return ONLY a single JSON object with these keys (omit any not requested):
${channelInstructions}

Output strictly valid JSON. No markdown fences. No commentary.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You write personalized B2B catering outreach. Always return strict JSON when asked." },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add funds in workspace settings.");
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`AI gateway error ${resp.status}: ${t.slice(0, 200)}`);
    }

    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: DraftResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }
    return parsed;
  });
