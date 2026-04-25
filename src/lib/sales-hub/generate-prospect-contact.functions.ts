import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiPost, AiGatewayError } from "@/lib/server-fns/_ai-gateway";

const InputSchema = z.object({
  businessName: z.string().min(1),
  city: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
});

const ContactPersonSchema = z.object({
  name: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

const ContactSchema = z.object({
  // Primary fields (kept for backward compatibility — first/best contact)
  contact_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  contacts: z.array(ContactPersonSchema).nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence: z.enum(["high", "medium", "low", "none"]).optional(),
});

export type GeneratedContactPerson = z.infer<typeof ContactPersonSchema>;
export type GeneratedProspectContact = z.infer<typeof ContactSchema>;

export const generateProspectContact = createServerFn({ method: "POST" })
  .inputValidator((raw) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const sys = `You are a B2B sales research assistant for a catering company. Given a business name${
      data.city ? `, city` : ""
    }, and type, infer the most likely public contact info for cold outreach: email, phone, website, mailing/physical address, and any specific contact people (with role, email, phone). Use the most plausible standard formats (info@, contact@, sales@, events@) when only a website domain is known. NEVER invent specific phone numbers or named individuals — only return them if you can derive them from common public patterns or leave null. Always set "confidence" honestly: "high" only when the info is widely publicly known; usually "medium" or "low".`;

    const user = `Business: ${data.businessName}
City: ${data.city ?? "(unknown)"}
Type: ${data.type ?? "(unknown)"}

Return JSON ONLY in this shape:
{
  "contact_name": string | null,        // best single point of contact name (or null)
  "email": string | null,               // best email (role-based fallback OK)
  "phone": string | null,               // main public phone (or null)
  "website": string | null,             // primary website (https://…)
  "address": string | null,             // full mailing/physical address as one line
  "contacts": [                         // 0–4 specific people if discoverable
    { "name": string | null, "role": string | null, "email": string | null, "phone": string | null }
  ],
  "notes": string | null,               // short note explaining how you derived the info
  "confidence": "high" | "medium" | "low" | "none"
}

Rules:
- Prefer a generic role-based email (events@, info@, sales@, contact@) on the business's likely domain when no specific person is known.
- "address" should be a single human-readable line (street, city, state, zip if available).
- "contacts" may be an empty array. Only include people you can plausibly derive from typical org structures (e.g. "Events Manager"). Do NOT invent named individuals.
- If a primary email/phone overlaps with the first contact person, that's fine — just be consistent.
- For "notes", briefly explain how you derived the info so the user can verify.
- If you have no idea, return all nulls, contacts: [], and confidence "none".`;

    try {
      const resp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      });
      const json = await resp.json();
      const content = json?.choices?.[0]?.message?.content ?? "{}";
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }
      const result = ContactSchema.safeParse(parsed);
      if (!result.success) {
        return {
          ok: true as const,
          contact: {
            contact_name: null, email: null, phone: null, website: null,
            address: null, contacts: [],
            notes: "AI returned an unexpected shape — please research manually.",
            confidence: "none" as const,
          },
        };
      }
      return { ok: true as const, contact: result.data };
    } catch (e) {
      const msg = e instanceof AiGatewayError ? e.message : (e as Error).message;
      return { ok: false as const, error: msg };
    }
  });
