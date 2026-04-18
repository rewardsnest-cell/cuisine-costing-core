import { createFileRoute } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { BookingTimeline } from "@/components/BookingTimeline";
import { SeasonalCTA } from "@/components/SeasonalCTA";
import { breadcrumbJsonLd, SITE_URL } from "@/lib/seo/jsonld";

export const Route = createFileRoute("/weddings/booking-timeline")({
  head: () => ({
    meta: [
      { title: "When to Book Your Wedding Caterer — VPS Finest" },
      { name: "description", content: "A calm, honest guide to when to book wedding catering in Northeast Ohio — typically 6 to 12 months ahead. What each stage looks like, and why earlier is usually easier." },
      { property: "og:title", content: "When to Book Your Wedding Caterer — VPS Finest" },
      { property: "og:description", content: "How far in advance to book wedding catering in Aurora, Hudson, and Cleveland. A reassuring, step-by-step timeline." },
    ],
    scripts: [
      breadcrumbJsonLd([
        { name: "Home", url: `${SITE_URL}/` },
        { name: "Weddings", url: `${SITE_URL}/weddings` },
        { name: "Booking timeline", url: `${SITE_URL}/weddings/booking-timeline` },
      ]),
    ],
  }),
  component: BookingTimelinePage,
});

function BookingTimelinePage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="pt-32 pb-16 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Booking timeline</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground leading-[1.1] mb-6">
            When to book your wedding caterer.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            There's no single right answer, but most couples in Northeast Ohio reach out six to twelve months before their wedding. Here's a calm look at why — and what each stage actually looks like with us.
          </p>
        </div>
      </section>

      <BookingTimeline variant="full" />

      <section className="py-20 bg-secondary border-t border-border">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-display text-3xl font-bold text-foreground mb-6">A few honest notes</h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed text-lg">
            <p>
              <strong className="text-foreground">Fall weekends fill first.</strong> September and October dates in Hudson, Aurora, and the surrounding area often book nine to twelve months ahead. If you have your heart set on a specific Saturday, earlier is easier.
            </p>
            <p>
              <strong className="text-foreground">Winter is more flexible.</strong> December through February has more openings and more flexibility on date and venue — a calm option for couples who want a less rushed planning process.
            </p>
            <p>
              <strong className="text-foreground">Late inquiries are welcome.</strong> If your date is closer than twelve months, please still reach out. We may have availability, and if we don't, we're happy to point you toward someone we trust.
            </p>
          </div>
        </div>
      </section>

      <SeasonalCTA
        heading="Wherever you are in planning, you're welcome to reach out."
        subhead="A few details about your day is all we need to start. We'll come back with a clear next step — never a hard sell."
      />

      <PublicFooter />
    </div>
  );
}
