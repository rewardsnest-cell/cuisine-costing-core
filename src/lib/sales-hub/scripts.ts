// Locked sales scripts. Edit only with intention — these are the source of truth
// surfaced read-only on /admin/sales-hub/scripts and elsewhere in the Sales Hub.

export type SalesScript = {
  id: string;
  title: string;
  context: string;
  body: string;
};

export const SALES_SCRIPTS: SalesScript[] = [
  {
    id: "phone-first",
    title: "A) Phone Script — First Contact",
    context: "Use when calling a venue, corporate office, or medical office for the first time.",
    body:
`Hi, this is [Your Name] with VPS Finest Catering here in Northeast Ohio.

I work with venues and offices around Aurora, Solon, and Hudson on catering for events, lunches, and meetings. I'm not calling to sell you anything today — I just wanted to introduce myself and find out who handles food on your end.

Would it make sense to send over a short menu and pricing sheet so you have it on file the next time something comes up?

Great — what's the best email for that? And is there a person who usually books these things I should send it to?

Thanks for your time. I'll follow up in a few days to make sure it landed.`,
  },
  {
    id: "phone-followup",
    title: "B) Phone Script — Follow-Up",
    context: "Use 3–5 days after first contact or after sending an email.",
    body:
`Hi [Name], this is [Your Name] with VPS Finest. I sent over our menu earlier this week and wanted to make sure it reached you.

No pressure at all — I just wanted to be on your radar for the next time you have an event, a lunch, or anything coming up where catering would help.

Is there anything on the calendar in the next month or two I could put together a quote for?

If not, I'll check back in a few weeks. Thanks again for the time.`,
  },
  {
    id: "walkin",
    title: "C) Walk-In Script",
    context: "Use when stopping by a venue or office in person. Keep it under 60 seconds.",
    body:
`Hi — I'm [Your Name] with VPS Finest Catering. We're local, based in Northeast Ohio, and we work with a lot of venues and offices around here.

I just wanted to drop off a one-pager with our menu and contact info — no appointment, no pitch.

Is there a person who usually handles food orders here that I should leave this with?

Thanks — have a great day.`,
  },
  {
    id: "email-corporate",
    title: "D) Corporate Email Script",
    context: "Use for corporate offices, HR, office managers, executive assistants.",
    body:
`Subject: Local catering option for your team — VPS Finest

Hi [Name],

I'm [Your Name] with VPS Finest Catering, a local team based in Northeast Ohio. We handle team lunches, client meetings, training days, and company events for offices around Aurora, Solon, and Hudson.

I've attached a short menu and pricing sheet so you have it on file. A few things that may matter to your team:

  • On-time delivery and clean setup
  • Dietary needs handled (vegetarian, gluten-free, allergy-aware)
  • Predictable pricing — no surprises on the invoice

If you'd like, I can put together a sample quote for an upcoming meeting or event so you can see exactly what it would look like.

Thanks for your time,
[Your Name]
VPS Finest Catering
[Phone] · [Email]`,
  },
  {
    id: "email-medical",
    title: "E) Medical Office Email Script",
    context: "Use for clinics, dental offices, hospital departments, lunch-and-learns.",
    body:
`Subject: Catering for your office or lunch-and-learns — VPS Finest

Hi [Name],

I'm [Your Name] with VPS Finest Catering, based here in Northeast Ohio. We work with a number of medical and dental offices on staff lunches, lunch-and-learns hosted by reps, and patient appreciation events.

I've attached our menu so you have it on file. A few things offices tell us they appreciate:

  • Quiet, on-time delivery so it doesn't disrupt patient flow
  • Individually packaged options when needed
  • Clear pricing and easy invoicing

If a rep or vendor ever needs a recommendation for lunch, we'd be glad to be on your short list. Happy to send a sample quote anytime.

Thanks,
[Your Name]
VPS Finest Catering
[Phone] · [Email]`,
  },
  {
    id: "email-venue",
    title: "F) Venue Partnership Email Script",
    context: "Use for wedding & event venues — focus on partnership, not a one-off sale.",
    body:
`Subject: Preferred caterer introduction — VPS Finest

Hi [Name],

I'm [Your Name] with VPS Finest Catering. We're a local Northeast Ohio team that focuses on weddings and private events, and I wanted to introduce us as a possible addition to your preferred caterer list.

What sets us apart for venue partnerships:

  • We treat your space the way you'd want it treated — clean setup, careful breakdown, respectful staff
  • Predictable, transparent pricing for your couples
  • Tasting and menu planning that makes the booking process easy on your team

If you're open to it, I'd love to come by, see the space, and talk about what a good partnership could look like. No pressure either way.

Thanks for considering,
[Your Name]
VPS Finest Catering
[Phone] · [Email]`,
  },
];

export const REVIEW_SCRIPTS = {
  inPerson: (link: string) =>
`Quick favor — if you enjoyed today, would you mind leaving us a short Google review? It honestly helps a small local team more than anything else.

Here's the link, takes about 30 seconds: ${link || "{{GOOGLE REVIEW LINK}}"}

Thank you so much.`,

  text: (link: string) =>
`Hi [Name] — thanks again for letting us cater your event. If you have a minute, a quick Google review would mean a lot to our team:

${link || "{{GOOGLE REVIEW LINK}}"}

Thanks so much! — VPS Finest`,

  email: (link: string) =>
`Subject: Thank you — and a quick favor

Hi [Name],

Thank you again for trusting us with your event. It was a pleasure working with you.

If you have a minute, a short Google review would mean a lot to our small team. It's the single best way to help us reach other people in the area:

${link || "{{GOOGLE REVIEW LINK}}"}

Thanks again,
[Your Name]
VPS Finest Catering`,
};

export const FOLLOW_UP_EMAIL = (day: 1 | 5 | 14) => {
  if (day === 1) {
    return `Subject: Quick follow-up — VPS Finest

Hi [Name],

Just making sure the menu I sent yesterday landed in your inbox. Happy to answer any questions or put a sample quote together whenever you're ready.

Thanks,
[Your Name]`;
  }
  if (day === 5) {
    return `Subject: Checking back in — VPS Finest

Hi [Name],

Wanted to check back in on the menu I sent over last week. Is there anything coming up in the next month or two I could put together a quote for? No pressure either way — just want to be helpful when the timing's right.

Thanks,
[Your Name]`;
  }
  return `Subject: Last note from me — VPS Finest

Hi [Name],

I don't want to keep filling up your inbox, so this will be my last note for now. If catering ever comes up — for an event, a lunch, anything — please keep us in mind. We'd love the chance to work with you.

You can reach me anytime at [Phone] or [Email].

Thanks for your time,
[Your Name]`;
};

export const REFERRAL_ASK = (link: string) =>
`Thank you again for the kind review — it genuinely means a lot.

One quick ask: if you know anyone else around Aurora, Solon, or Hudson who might need catering for an event, lunch, or meeting, would you mind passing along our info? A short intro by email or text is the easiest way.

Here's our review link in case it's helpful: ${link || "{{GOOGLE REVIEW LINK}}"}

Thanks so much.`;

export const REVIEW_RULES = [
  "Ask only happy clients — never ask if anything went wrong.",
  "Ask within 24 hours of the event, while the experience is fresh.",
  "Respond to every review — positive or negative — within 48 hours.",
  "Never offer anything in exchange for a review.",
];

export const PROSPECT_CITIES = [
  "Aurora, OH", "Solon, OH", "Hudson, OH",
  "Cleveland, OH", "Beachwood, OH", "Chagrin Falls, OH",
  "Akron, OH", "Kent, OH", "Stow, OH",
  "Medina, OH", "Strongsville, OH",
] as const;
export const PROSPECT_TYPES = ["Venue", "Corporate", "Medical"] as const;
export const PROSPECT_STATUSES = ["New", "Contacted", "Interested", "Booked", "Repeat", "Archived"] as const;
export const PROSPECT_PRIORITIES = ["High", "Medium", "Long-Term"] as const;
