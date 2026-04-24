import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Building2, PartyPopper, Home, ClipboardList, CalendarCheck, Users, UtensilsCrossed } from "lucide-react";
import { useAsset } from "@/lib/use-asset";
import pathCateringStatic from "@/assets/site/path-catering.jpg";
import { faqJsonLd } from "@/lib/seo/jsonld";

export const Route = createFileRoute("/catering")({
  head: () => ({
    meta: [
      { title: "Event Catering — VPS Finest" },
      {
        name: "description",
        content:
          "Professional event catering across Northeast Ohio. A structured planning process for corporate, social, and private events. Start a quote — no pricing pressure.",
      },
      { property: "og:title", content: "Event Catering — VPS Finest" },
      {
        property: "og:description",
        content:
          "A calm, structured catering process for corporate, social, and private events. We organize the details before any numbers are discussed.",
      },
    ],
    scripts: [faqJsonLd(FAQS)],
  }),
  component: CateringPage,
});

const FAQS = [
  {
    q: "What kinds of events do you cater?",
    a: "Corporate gatherings, private celebrations, and structured hosted events across Northeast Ohio. Wedding catering has its own dedicated process and page.",
  },
  {
    q: "What happens after I start a quote?",
    a: "We collect the structural details first — date, guest count, venue, service style. Pricing is not part of the early conversation. We'd rather understand your event clearly before putting numbers in front of you.",
  },
  {
    q: "Will I be locked in by starting a quote?",
    a: "No. Starting a quote begins a structured intake — not a commitment. You'll receive a reference number you can use to follow your quote through its phases.",
  },
  {
    q: "How far in advance should I reach out?",
    a: "Earlier gives us more room to plan well. For most events, four to six weeks is comfortable. Tighter timelines are sometimes possible — start a quote and we'll respond honestly.",
  },
  {
    q: "Do you handle staffing, rentals, and setup?",
    a: "Yes. These are part of the structured plan, gathered during intake so the proposal reflects the full shape of your event — not just the food.",
  },
];

const EVENT_TYPES = [
  {
    icon: Building2,
    title: "Corporate events",
    body: "Board meetings, all-hands lunches, conferences, holiday parties, and team gatherings. Suited for organizations that need predictable execution and clear coordination.",
  },
  {
    icon: PartyPopper,
    title: "Private celebrations",
    body: "Milestone birthdays, anniversaries, showers, retirements, and family gatherings. Planned with the same structure we apply to larger events, scaled to the room.",
  },
  {
    icon: Home,
    title: "Hosted & structured gatherings",
    body: "In-home dinners, donor receptions, fundraisers, and curated guest experiences where the host needs to be present rather than managing logistics.",
  },
];

const PHASES = [
  {
    icon: ClipboardList,
    label: "Phase 1 — Intake",
    title: "We learn the shape of your event.",
    body: "Date, venue, guest count, service style, and the considerations that matter. Short, structured, no rush.",
  },
  {
    icon: Users,
    label: "Phase 2 — Structuring",
    title: "Your event is organized before anything is priced.",
    body: "Service flow, staffing, dietary needs, and venue logistics are translated into a clear plan you can see.",
  },
  {
    icon: CalendarCheck,
    label: "Phase 3 — Proposal",
    title: "A formal proposal, when the picture is clear.",
    body: "Numbers arrive with context — after your event is properly understood, not before.",
  },
];

function CateringPage() {
  const { url: heroOverride } = useAsset("path-catering");
  const hero = heroOverride ?? pathCateringStatic;

  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero — clear, professional, no hype */}
      <section className="relative pt-16 min-h-[60vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          <img
            src={hero}
            alt="A professionally set catering service by VPS Finest"
            className="w-full h-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-foreground/60" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <p className="text-xs tracking-[0.25em] uppercase text-background/75 mb-5">
            Event catering
          </p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-[1.1]">
            Catering planned with structure,
            <br />
            executed with care.
          </h1>
          <p className="mt-6 text-lg text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            Professional catering across Northeast Ohio for corporate, social, and private events.
            We organize the details first — pricing comes later, once your event is clearly understood.
          </p>
        </div>
      </section>

      {/* 2. Types of events catered */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
              Events we cater
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Find the shape that fits your event.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We cater events that benefit from a structured, professional process.
              If your event resembles one of these, you're in the right place.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {EVENT_TYPES.map((e) => {
              const Icon = e.icon;
              return (
                <Card key={e.title} className="border-border/70">
                  <CardContent className="p-7">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center mb-5">
                      <Icon className="w-5 h-5 text-foreground" />
                    </div>
                    <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                      {e.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{e.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-10">
            Planning a wedding?{" "}
            <Link to="/weddings" className="text-primary hover:underline">
              See our wedding catering process
            </Link>
            .
          </p>
        </div>
      </section>

      {/* 3. How catering works at VPS Finest */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
              How catering works here
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              A phased process, in plain steps.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Our process moves through clear phases so you always know what's been decided,
              what's coming next, and what's still open. Predictable, not rushed.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {PHASES.map((p) => {
              const Icon = p.icon;
              return (
                <Card key={p.label} className="border-border/70 bg-background">
                  <CardContent className="p-7">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center mb-5">
                      <Icon className="w-5 h-5 text-foreground" />
                    </div>
                    <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
                      {p.label}
                    </p>
                    <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                      {p.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Menus as guidance */}
      <section className="py-24 bg-background border-t border-border">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <UtensilsCrossed className="w-6 h-6 text-muted-foreground mx-auto mb-5" />
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
            About our menus
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-5">
            Menus are starting points, not catalogs.
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We keep curated menus as reference material to help shape early conversations.
            They are not fixed packages, and they are not meant to be ordered from like a list.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-10">
            The menu for your event is refined later in the process — once your guest count,
            service style, dietary needs, and venue have been properly understood.
          </p>
          <Link
            to="/menu"
            className="inline-flex items-center justify-center gap-2 rounded-sm border border-foreground/30 px-6 py-2.5 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            Browse reference menus
          </Link>
        </div>
      </section>

      {/* 5. Clear next step */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
            When you're ready
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Start a catering quote.
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            You'll share a few structural details about your event. We'll respond with the next step
            and a reference number you can use to follow your quote's progress.
          </p>
          <p className="text-sm text-muted-foreground mb-10">
            <span className="font-medium text-foreground">No pricing is shown at this stage.</span>{" "}
            Numbers come later, once your event is clearly understood.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/quote/start"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Start a catering quote <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              Prefer to talk first
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-background border-t border-border">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-12">
            Common questions
          </p>
          <h2 className="sr-only">Catering frequently asked questions</h2>
          <div className="space-y-10">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-display text-xl font-bold text-foreground mb-3">{f.q}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
