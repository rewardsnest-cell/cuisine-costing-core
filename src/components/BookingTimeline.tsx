import { Link } from "@tanstack/react-router";

type Variant = "full" | "compact";

const STEPS = [
  {
    when: "12–9 months out",
    t: "Start the conversation",
    d: "Reach out once you have a date or a short list of venues. We'll talk through your day, share availability, and answer early questions — no pressure to commit.",
  },
  {
    when: "9–6 months out",
    t: "Shape the menu",
    d: "We design a draft menu around your guests, your venue, and the food you love. You'll see clear, itemized pricing before anything is locked in.",
  },
  {
    when: "6–3 months out",
    t: "Tasting and refinement",
    d: "Come in for a tasting. Adjust dishes, finalize service style, and confirm the timeline together.",
  },
  {
    when: "3–1 months out",
    t: "Final details",
    d: "Final guest count, dietary needs, and day-of logistics — handled calmly, in writing, and well before the week of your wedding.",
  },
  {
    when: "Day of",
    t: "Quiet, attentive service",
    d: "We arrive, set up, serve, and tidy. You get to be present at your own wedding.",
  },
];

export function BookingTimeline({ variant = "full" }: { variant?: Variant }) {
  const steps = variant === "compact" ? STEPS.slice(0, 3) : STEPS;

  return (
    <section className="py-20 bg-background border-t border-border">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">
          Booking timeline
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground text-center mb-5">
          When to book your wedding caterer.
        </h2>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-14">
          Most couples reach out six to twelve months before their date — earlier for spring and fall weekends in Northeast Ohio. Here's a calm view of what each stage looks like with us.
        </p>
        <ol className="space-y-10">
          {steps.map((s) => (
            <li key={s.t} className="grid sm:grid-cols-[180px_1fr] gap-3 sm:gap-8">
              <p className="text-xs tracking-[0.2em] uppercase text-accent pt-1">{s.when}</p>
              <div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">{s.t}</h3>
                <p className="text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        {variant === "compact" && (
          <p className="text-center mt-12">
            <Link to="/weddings/booking-timeline" className="text-sm tracking-[0.2em] uppercase text-accent hover:underline">
              See the full timeline →
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
