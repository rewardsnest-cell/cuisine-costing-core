import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/weddings")({
  head: () => ({
    meta: [
      { title: "Wedding Catering — VPS Finest, Aurora Ohio" },
      { name: "description", content: "Plated, family-style, and buffet wedding catering across Northeast Ohio. Tastings included. Built around your day, not a template." },
      { property: "og:title", content: "Wedding Catering — VPS Finest" },
      { property: "og:description", content: "Plated, family-style, and buffet wedding catering across Northeast Ohio." },
    ],
  }),
  component: WeddingsPage,
});

function WeddingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="pt-24 pb-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-primary text-xs tracking-widest uppercase mb-3">Weddings</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-6">Built around your day.</h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Plated, family-style, or buffet — every wedding menu starts with a tasting and a conversation,
          not a template. Tell us what you love and we'll design around it.
        </p>
        <div className="mt-8 flex gap-4 flex-wrap">
          <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-warm transition-all hover:opacity-90">
            Start Your Wedding Quote
          </Link>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-lg border border-primary/30 px-8 py-3.5 text-sm font-semibold text-primary transition-all hover:bg-secondary">
            Book a Tasting
          </Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
