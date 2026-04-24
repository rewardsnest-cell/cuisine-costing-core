import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ClipboardList, CalendarCheck, Users, ShieldCheck, BookOpen } from "lucide-react";
import { faqJsonLd } from "@/lib/seo/jsonld";
import { useAsset } from "@/lib/use-asset";
import pathCateringStatic from "@/assets/site/path-catering.jpg";

export const Route = createFileRoute("/weddings/")({
  head: () => ({
    meta: [
      { title: "Wedding Catering — VPS Finest" },
      {
        name: "description",
        content:
          "How VPS Finest handles wedding catering in Northeast Ohio: a structured, unhurried process built around your day. Start a wedding quote — no pricing pressure.",
      },
      { property: "og:title", content: "Wedding Catering — VPS Finest" },
      {
        property: "og:description",
        content:
          "A calm, structured process for wedding catering. We organize the details before any numbers are discussed.",
      },
    ],
    scripts: [faqJsonLd(FAQS)],
  }),
  component: WeddingsPage,
});

const FAQS = [
  {
    q: "When should we first reach out?",
    a: "Earlier is calmer. Six to twelve months out is typical, but starting a quote sooner just gives us more room to plan thoughtfully. Reaching out doesn't lock anything in.",
  },
  {
    q: "What happens after we start a wedding quote?",
    a: "We collect the structural details first — date, venue, guest count, the shape of your day. Nothing about pricing is discussed until your event is clearly understood and structured.",
  },
  {
    q: "Will we be pressured to commit early?",
    a: "No. The early stages of our process are intentionally low-pressure. We're organizing your event, not selling against a clock.",
  },
  {
    q: "Do you handle dietary needs and allergies?",
    a: "Yes. These are gathered as part of the structured intake so the menu is designed with your guests in mind from the start — not patched in later.",
  },
  {
    q: "Do you travel across Northeast Ohio?",
    a: "Yes. We regularly cater weddings throughout the region. Travel and logistics are part of the structured planning, not a surprise at the end.",
  },
];

const PHASES = [
  {
    icon: ClipboardList,
    label: "Phase 1 — Intake",
    title: "We learn the shape of your day.",
    body: "Date, venue, guest count, service style, and the considerations that matter most. A short, structured conversation — nothing rushed, nothing assumed.",
  },
  {
    icon: Users,
    label: "Phase 2 — Structuring",
    title: "Your event is organized before anything is priced.",
    body: "We translate intake into a clear plan: courses, service flow, staffing shape, dietary needs. You see your event becoming legible before any numbers enter the conversation.",
  },
  {
    icon: CalendarCheck,
    label: "Phase 3 — Proposal",
    title: "A formal proposal, when the picture is clear.",
    body: "Only once your event is properly structured do we put a thoughtful proposal in front of you. It arrives with context, not a price tag dropped from nowhere.",
  },
];

const GUIDES = [
  {
    to: "/weddings/booking-timeline",
    title: "Wedding booking timeline",
    description: "A calm month-by-month view of how wedding catering planning typically unfolds.",
  },
  {
    to: "/weddings/spring-aurora-ohio",
    title: "Spring weddings in Aurora, Ohio",
    description: "Seasonal considerations for spring weddings in our home region.",
  },
  {
    to: "/weddings/fall-hudson-ohio",
    title: "Fall weddings in Hudson, Ohio",
    description: "How autumn timing, light, and venues shape a wedding plan.",
  },
  {
    to: "/weddings/winter-cleveland-ohio",
    title: "Winter weddings in Cleveland, Ohio",
    description: "What changes when you cater a wedding in the colder months.",
  },
] as const;

function WeddingsPage() {
  const weddingsHero = useAsset("hero-weddings");
  const cateringFallback = useAsset("path-catering");
  const hero = weddingsHero.url ?? cateringFallback.url ?? pathCateringStatic;

  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero — calm, structured, no romance clichés */}
      <section className="relative pt-16 min-h-[60vh] flex items-center justify-center text-center">
        <div className="absolute inset-0 bg-muted">
          <img
            src={hero}
            alt="A quietly set wedding table prepared by VPS Finest"
            className="w-full h-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-foreground/60" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 py-20">
          <p className="text-xs tracking-[0.25em] uppercase text-background/75 mb-5">
            Wedding catering
          </p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-[1.1]">
            Weddings handled with structure,
            <br />
            not pressure.
          </h1>
          <p className="mt-6 text-lg text-background/90 max-w-xl mx-auto leading-relaxed font-light">
            A measured, professional process for couples planning their wedding catering.
            We organize the details first — pricing comes later, once your event is clearly understood.
          </p>
        </div>
      </section>

      {/* 2. How weddings are handled at VPS Finest */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
              How we handle weddings
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              A phased process, in plain steps.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Wedding catering deserves to be planned, not improvised.
              Our process moves through clear phases so nothing important is rushed,
              and so you always know what stage your event is in.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {PHASES.map((p) => {
              const Icon = p.icon;
              return (
                <Card key={p.label} className="border-border/70">
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

      {/* 3. Why weddings require a different approach */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
              Why weddings are different
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Higher stakes ask for steadier process.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              A wedding isn't a regular catering event. The day cannot be rerun,
              the guest list is rarely simple, and small details carry real weight.
              We've found that the calmest weddings are the ones where the process itself
              was unhurried and well-organized from the start.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            {[
              {
                t: "One-shot timing",
                d: "Service has to land on a precise schedule that ties into the ceremony, photos, toasts, and the venue's own constraints. We plan the timeline before we plan the menu.",
              },
              {
                t: "Mixed guest needs",
                d: "Allergies, dietary preferences, kids, elders, and out-of-town guests all show up at the same table. These get gathered and resolved during structuring — not as last-minute exceptions.",
              },
              {
                t: "Venue realities",
                d: "Kitchens, power, access, and load-in times vary widely. We work through venue logistics early so the day-of has no surprises.",
              },
              {
                t: "Decision fatigue",
                d: "Couples are already making dozens of decisions. Our process is built to reduce — not add to — the cognitive load you're carrying.",
              },
            ].map((item) => (
              <div key={item.t} className="flex gap-4">
                <ShieldCheck className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                    {item.t}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Clear next step (placed before guides so the path forward is obvious) */}
      <section className="py-24 bg-background border-t border-border">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
            When you're ready
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Start a wedding quote.
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            You'll share a few structural details about your day. We'll respond with the next step
            in the process and a reference number you can use to follow your quote's progress.
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
              Start a wedding quote <ArrowRight className="w-4 h-4" />
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

      {/* 4. Wedding guides — supporting only */}
      <section className="py-20 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-start gap-3 mb-8">
            <BookOpen className="w-5 h-5 text-muted-foreground mt-1" />
            <div>
              <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">
                Optional reading
              </p>
              <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
                Wedding guides
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
                Reference material for couples who want to read ahead. None of these are required —
                you can begin a quote without reading any of them.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <Link
                key={g.to}
                to={g.to}
                className="group block rounded-md border border-border/70 bg-background p-5 hover:border-primary/40 transition-colors"
              >
                <h3 className="font-display text-base font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors">
                  {g.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{g.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-background border-t border-border">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-12">
            Common questions
          </p>
          <h2 className="sr-only">Wedding catering frequently asked questions</h2>
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
