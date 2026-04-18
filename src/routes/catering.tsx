import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/catering")({
  head: () => ({
    meta: [
      { title: "Catering — VPS Finest, Aurora Ohio" },
      { name: "description", content: "Corporate, social, and private event catering. Transparent pricing, seasonal menus, and a chef who actually answers your calls." },
      { property: "og:title", content: "Catering — VPS Finest, Aurora Ohio" },
      { property: "og:description", content: "Corporate, social, and private event catering with transparent pricing." },
    ],
  }),
  component: CateringPage,
});

function CateringPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="pt-24 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-primary text-xs tracking-widest uppercase mb-3">Catering</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-6">Done well. Done quietly.</h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          We cater corporate lunches, holiday parties, social gatherings, and private dinners across Northeast Ohio.
          Every quote includes a real itemized breakdown — no surprise fees the week of your event.
        </p>
        <div className="mt-8">
          <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-warm transition-all hover:opacity-90">
            Build Your Quote
          </Link>
        </div>
      </section>
      <section className="py-16 bg-secondary">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-3">
          {[
            { t: "Corporate", d: "Boxed lunches, all-hands meals, holiday parties." },
            { t: "Social", d: "Birthdays, showers, milestone gatherings." },
            { t: "Private", d: "In-home dinners and intimate chef experiences." },
          ].map((c) => (
            <div key={c.t} className="bg-background rounded-xl p-6 border border-border">
              <h3 className="font-display text-xl text-primary mb-2">{c.t}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
