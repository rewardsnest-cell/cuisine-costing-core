// Prospect outreach templates, tuned per prospect type (Venue / Corporate / Medical).
// Each template renders subject + plain-text + HTML using the prospect data.

export type ProspectTemplateKey =
  | "venue_intro"
  | "venue_offer"
  | "corporate_intro"
  | "corporate_lunch"
  | "medical_intro"
  | "medical_provider_lunch"
  | "generic_followup";

export type ProspectType = "Venue" | "Corporate" | "Medical" | string;

export interface ProspectForTemplate {
  business_name: string;
  contact_name?: string | null;
  city?: string | null;
  type?: string | null;
  email?: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface ProspectTemplateMeta {
  key: ProspectTemplateKey;
  label: string;
  description: string;
  audience: ProspectType[]; // which prospect types this is recommended for
}

const SIGNATURE_NAME = "VPs Finest";
const SIGNATURE_LINE = `\n\n— The ${SIGNATURE_NAME} Team`;

const greet = (p: ProspectForTemplate) =>
  p.contact_name && p.contact_name.trim()
    ? `Hi ${p.contact_name.trim().split(/\s+/)[0]},`
    : "Hello,";

const wrapHtml = (bodyText: string) => {
  // Convert plain text body to a simple branded HTML block.
  const escaped = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#222;font-size:15px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;">${paragraphs}</div>`;
};

const TEMPLATES: Record<ProspectTemplateKey, {
  meta: ProspectTemplateMeta;
  build: (p: ProspectForTemplate) => RenderedEmail;
}> = {
  venue_intro: {
    meta: {
      key: "venue_intro",
      label: "Venue · Intro",
      description: "Warm introduction for event/wedding venues — preferred caterer angle.",
      audience: ["Venue"],
    },
    build: (p) => {
      const text = `${greet(p)}

I'm reaching out from ${SIGNATURE_NAME}. We specialize in upscale event catering${p.city ? ` across ${p.city}` : ""}, and ${p.business_name} keeps coming up as one of the standout venues in the area.

We'd love to be on your preferred-caterer list. We handle everything from plated dinners to large buffets, and we make the venue's job easy — clean setup, professional staff, and a tasting whenever you'd like to try us.

Could I drop off a sample menu and pricing this week, or set up a 15-minute call?${SIGNATURE_LINE}`;
      return {
        subject: `${SIGNATURE_NAME} × ${p.business_name} — preferred caterer intro`,
        text,
        html: wrapHtml(text),
      };
    },
  },
  venue_offer: {
    meta: {
      key: "venue_offer",
      label: "Venue · Tasting offer",
      description: "Follow-up with a complimentary tasting offer for venue coordinators.",
      audience: ["Venue"],
    },
    build: (p) => {
      const text = `${greet(p)}

Quick follow-up — we'd love to host you and the ${p.business_name} team for a complimentary tasting at our kitchen. It's the easiest way to see whether we're the right fit for your couples and corporate clients.

Pick any weekday that works and I'll set it up. We can walk through plated, buffet, and stations — and talk through how we coordinate with your event team day-of.${SIGNATURE_LINE}`;
      return {
        subject: `Tasting on us — ${p.business_name}`,
        text,
        html: wrapHtml(text),
      };
    },
  },
  corporate_intro: {
    meta: {
      key: "corporate_intro",
      label: "Corporate · Intro",
      description: "Cold intro for corporate offices — meetings, board lunches, all-hands.",
      audience: ["Corporate"],
    },
    build: (p) => {
      const text = `${greet(p)}

I'm with ${SIGNATURE_NAME} — we cater corporate meetings, board lunches, and team events${p.city ? ` around ${p.city}` : ""}. I wanted to reach out to ${p.business_name} because we work with several teams nearby and consistently get repeat orders for client meetings and quarterly all-hands.

A few things our corporate clients appreciate:
- On-time delivery, every time
- Clean disposable setups, or full china service
- Dietary restrictions handled without a fuss
- One contact, one invoice, easy reorders

Could I send over our corporate menu and a sample order for your team to try?${SIGNATURE_LINE}`;
      return {
        subject: `Catering for ${p.business_name} meetings & events`,
        text,
        html: wrapHtml(text),
      };
    },
  },
  corporate_lunch: {
    meta: {
      key: "corporate_lunch",
      label: "Corporate · Lunch program",
      description: "Pitch a recurring weekly lunch program to office managers / EAs.",
      audience: ["Corporate"],
    },
    build: (p) => {
      const text = `${greet(p)}

Following up — does ${p.business_name} have a recurring team lunch program? We run weekly and bi-weekly drops for several offices and could easily add ${p.business_name} into the rotation.

Typical setup: rotating menu, fixed per-head price, delivered and set up at the same time each week. Office managers love it because it's one less thing to think about.

Want me to put together a sample 4-week rotation for your team size?${SIGNATURE_LINE}`;
      return {
        subject: `Weekly team lunches for ${p.business_name}?`,
        text,
        html: wrapHtml(text),
      };
    },
  },
  medical_intro: {
    meta: {
      key: "medical_intro",
      label: "Medical · Intro",
      description: "Intro for clinics/hospitals — staff appreciation, training-day catering.",
      audience: ["Medical"],
    },
    build: (p) => {
      const text = `${greet(p)}

I'm reaching out from ${SIGNATURE_NAME}. We cater for medical offices and clinics${p.city ? ` in ${p.city}` : ""} — staff lunches, training days, on-call appreciation meals, and provider events.

We know medical offices have specific needs: tight delivery windows, individually-packed options for infection control, allergy clarity on every label, and clean setups that don't disrupt patient flow. We've built our process around that.

Would there be a good time for a 10-minute call, or can I drop off a sample menu and a few items to try?${SIGNATURE_LINE}`;
      return {
        subject: `Catering for ${p.business_name} — staff & provider meals`,
        text,
        html: wrapHtml(text),
      };
    },
  },
  medical_provider_lunch: {
    meta: {
      key: "medical_provider_lunch",
      label: "Medical · Provider/rep lunches",
      description: "For pharma reps or providers booking sponsored lunches at clinics.",
      audience: ["Medical"],
    },
    build: (p) => {
      const text = `${greet(p)}

Quick note — we handle a lot of provider and rep-sponsored lunches for medical offices${p.city ? ` in ${p.city}` : ""}. If ${p.business_name} books these, I'd love to be on your shortlist.

We make it simple: itemized invoices for compliance, individually-packed options, and on-time delivery to the back office without disrupting the front desk. Reps and office managers tend to keep coming back once they try us.

Happy to send menu + pricing — what's the best email for that?${SIGNATURE_LINE}`;
      return {
        subject: `Provider lunches at ${p.business_name}`,
        text,
        html: wrapHtml(text),
      };
    },
  },
  generic_followup: {
    meta: {
      key: "generic_followup",
      label: "Generic · Follow-up",
      description: "Light, friendly follow-up if you haven't heard back.",
      audience: ["Venue", "Corporate", "Medical"],
    },
    build: (p) => {
      const text = `${greet(p)}

Just floating my note back to the top of your inbox. Totally understand if now isn't the right time for ${p.business_name} — would it be better if I circled back in a month or two?

Either way, here when you need us.${SIGNATURE_LINE}`;
      return {
        subject: `Re: ${SIGNATURE_NAME} — ${p.business_name}`,
        text,
        html: wrapHtml(text),
      };
    },
  },
};

export const PROSPECT_TEMPLATE_LIST: ProspectTemplateMeta[] = Object.values(TEMPLATES).map(
  (t) => t.meta,
);

export function getRecommendedTemplates(type: string | null | undefined): ProspectTemplateMeta[] {
  if (!type) return PROSPECT_TEMPLATE_LIST;
  const matches = PROSPECT_TEMPLATE_LIST.filter((t) => t.audience.includes(type));
  return matches.length > 0 ? matches : PROSPECT_TEMPLATE_LIST;
}

export function renderProspectTemplate(
  key: ProspectTemplateKey,
  prospect: ProspectForTemplate,
): RenderedEmail {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`Unknown template: ${key}`);
  return tpl.build(prospect);
}

export function defaultTemplateForType(type: string | null | undefined): ProspectTemplateKey {
  switch (type) {
    case "Venue": return "venue_intro";
    case "Corporate": return "corporate_intro";
    case "Medical": return "medical_intro";
    default: return "generic_followup";
  }
}
