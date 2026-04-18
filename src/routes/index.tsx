import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import heroCatering from "@/assets/hero-catering.jpg";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="relative pt-16 min-h-[90vh] flex items-center">
        <div className="absolute inset-0">
          <img src={heroCatering} alt="Premium catering spread" className="w-full h-full object-cover" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-2xl">
            <p className="text-accent font-medium text-sm tracking-widest uppercase mb-4">Premium Catering Solutions</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-background leading-tight">
              Exceptional Events, <br />
              <span className="italic text-background">Perfectly Quoted</span>
            </h1>
            <p className="mt-6 text-lg text-background/80 max-w-lg leading-relaxed">
              Build stunning catering proposals with accurate costing, seasonal menus, and real-time inventory pricing. Trusted by premium caterers.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/quote"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-warm transition-all hover:opacity-90"
              >
                Basic Builder
              </Link>
              <Link
                to="/quote/ai"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 text-sm font-semibold text-accent-foreground shadow-warm transition-all hover:opacity-90 gap-2"
              >
                ✨ Advanced AI Builder
              </Link>
              <Link
                to="/lookup"
                className="inline-flex items-center justify-center rounded-lg border border-background/30 bg-background/10 backdrop-blur-sm px-8 py-3.5 text-sm font-semibold text-background transition-all hover:bg-background/20"
              >
                Look Up My Quote
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-accent font-medium text-sm tracking-widest uppercase mb-2">Why TasteQuote</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">Enterprise-Grade Catering Operations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Smart Quoting", desc: "Interactive quiz-based quote builder with seasonal menus, allergen filtering, and real-time cost calculations.", icon: "📋" },
              { title: "Receipt OCR & Costing", desc: "Upload receipts, auto-extract line items, and update inventory costs with weighted moving averages.", icon: "📸" },
              { title: "Inventory Intelligence", desc: "Track stock levels, par levels, supplier pricing, and get cost variance alerts in real time.", icon: "📦" },
            ].map((f) => (
              <div key={f.title} className="bg-card rounded-2xl p-8 shadow-warm border border-border/50 hover:shadow-gold transition-shadow">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Ready to Elevate Your Catering?</h2>
          <p className="text-primary-foreground/80 mb-8 text-lg">Start building professional proposals with accurate costing in minutes.</p>
          <Link to="/quote" className="inline-flex items-center justify-center rounded-lg bg-background text-foreground px-8 py-3.5 text-sm font-semibold shadow-warm transition-all hover:bg-background/90">
            Get Started Free
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
