import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiPost, AiGatewayError } from "@/lib/server-fns/_ai-gateway";
import Firecrawl from "@mendable/firecrawl-js";

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

function getFirecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  try { return new Firecrawl({ apiKey }); } catch { return null; }
}

function truncate(s: string | undefined | null, max: number) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

/** Try to gather real public info from the web before asking the AI. */
async function researchOnline(opts: { businessName: string; city?: string | null; type?: string | null }) {
  const fc = getFirecrawl();
  if (!fc) return { evidence: "", sources: [] as string[], note: "No web research available." };

  const queryParts = [opts.businessName, opts.city, opts.type, "contact email phone address"];
  const query = queryParts.filter(Boolean).join(" ");
  const sources: string[] = [];
  let evidence = "";

  try {
    const search: any = await fc.search(query, { limit: 5 });
    const results: any[] = search?.web ?? search?.data ?? search?.results?.web ?? [];
    const homepage = results.find((r) => r?.url) ?? null;

    // Top results — title + description for context
    const topSummaries = results.slice(0, 5).map((r: any, i: number) => {
      if (r?.url) sources.push(r.url);
      return `(${i + 1}) ${r?.title ?? ""}\n${r?.url ?? ""}\n${r?.description ?? r?.snippet ?? ""}`;
    }).join("\n\n");
    if (topSummaries) evidence += `WEB SEARCH RESULTS:\n${topSummaries}\n\n`;

    // Scrape the most promising result (likely the business website or contact page)
    const targetUrl: string | undefined = homepage?.url;
    if (targetUrl) {
      try {
        const scrape: any = await fc.scrape(targetUrl, {
          formats: ["markdown"],
          onlyMainContent: true,
        });
        const md: string = scrape?.markdown ?? scrape?.data?.markdown ?? "";
        if (md) evidence += `SCRAPED HOMEPAGE (${targetUrl}):\n${truncate(md, 6000)}\n\n`;
      } catch (e) {
        // ignore scrape failures
      }

      // Also try a /contact page on the same domain
      try {
        const u = new URL(targetUrl);
        const contactUrl = `${u.protocol}//${u.host}/contact`;
        const scrape2: any = await fc.scrape(contactUrl, {
          formats: ["markdown"],
          onlyMainContent: true,
        });
        const md2: string = scrape2?.markdown ?? scrape2?.data?.markdown ?? "";
        if (md2) {
          evidence += `SCRAPED CONTACT PAGE (${contactUrl}):\n${truncate(md2, 4000)}\n\n`;
          sources.push(contactUrl);
        }
      } catch {
        // contact page might not exist; that's fine
      }
    }
  } catch (e: any) {
    return { evidence: "", sources, note: `Web research failed: ${e?.message ?? "unknown"}` };
  }

  return { evidence: truncate(evidence, 14000), sources, note: "" };
}

export const generateProspectContact = createServerFn({ method: "POST" })
  .inputValidator((raw) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const research = await researchOnline({
      businessName: data.businessName, city: data.city, type: data.type,
    });

    const sys = `You are a meticulous B2B sales research analyst for a catering company. You will receive (a) a business name, city, and type, and (b) raw web search results and scraped page content. Your job is to extract the BEST PUBLIC contact info: primary website, mailing/physical address, main phone, main email, and named contact people with roles, emails, and phones — preferring info actually present in the EVIDENCE. If a field cannot be supported by the evidence, fall back to the most plausible standard format (info@, contact@, sales@, events@) using the discovered domain, and clearly say so in "notes". NEVER invent specific phone numbers or named individuals that are not present in the evidence. Set "confidence" honestly: "high" only when the field is directly supported by scraped/searched content; "medium" for plausible derivations; "low" when unsure; "none" when nothing useful was found.`;

    const user = `Business: ${data.businessName}
City: ${data.city ?? "(unknown)"}
Type: ${data.type ?? "(unknown)"}

EVIDENCE (from web search + scraping; may be empty):
${research.evidence || "(no web evidence available)"}

${research.note ? `Note: ${research.note}\n` : ""}
Return JSON ONLY in this shape:
{
  "contact_name": string | null,
  "email": string | null,
  "phone": string | null,
  "website": string | null,
  "address": string | null,
  "contacts": [
    { "name": string | null, "role": string | null, "email": string | null, "phone": string | null }
  ],
  "notes": string | null,
  "confidence": "high" | "medium" | "low" | "none"
}

Rules:
- Prefer real values found in the EVIDENCE over guesses. Quote/cite briefly in "notes".
- "address" must be a single human-readable line (street, city, state, zip if available).
- "contacts" can include up to 5 named people if discoverable from the evidence (owner, GM, events manager, sales lead, chef). Do NOT invent names.
- If only a domain is known, derive a role-based email (events@, info@, sales@, contact@) and mark confidence "low" or "medium".
- "notes" should briefly cite which source(s) supported each field (e.g. "Phone & address from scraped homepage; events@ derived from domain.").
- If evidence is empty and you have no idea, return all nulls, contacts: [], confidence "none".`;

    try {
      const resp = await aiPost({
        // Stronger model for deeper reasoning over scraped content
        model: "google/gemini-2.5-pro",
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
      // Append source URLs to notes for transparency
      const data2 = result.data;
      if (research.sources.length > 0) {
        const srcLine = `Sources: ${research.sources.slice(0, 5).join(", ")}`;
        data2.notes = data2.notes ? `${data2.notes}\n${srcLine}` : srcLine;
      }
      return { ok: true as const, contact: data2 };
    } catch (e) {
      const msg = e instanceof AiGatewayError ? e.message : (e as Error).message;
      return { ok: false as const, error: msg };
    }
  });
