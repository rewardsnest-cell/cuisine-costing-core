import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import heroCatering from "@/assets/hero-catering.jpg";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <PublicHeader />

      {/* Hero */}
      <section className="px-6 py-4">
        <div className="relative h-[85vh] w-full max-w-[1500px] mx-auto overflow-hidden rounded-sm bg-foreground">
          <img
            src={heroCatering}
            alt="Cinematic catering spread"
            className="w-full h-full object-cover opacity-60"
            width={1920}
            height={1080}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <p className="text-background/80 text-[11px] uppercase tracking-[0.4em] mb-6">
              A Private Culinary Experience
            </p>
            <h1 className="font-display text-white text-5xl sm:text-6xl md:text-8xl italic mb-8 tracking-tight text-balance">
              Good food. No stress.
            </h1>
            <div className="h-px w-24 bg-background/30 mb-8" />
            <p className="max-w-[50ch] text-background/70 text-xs sm:text-sm uppercase tracking-[0.18em]">
              Crafting intentional moments around the table
            </p>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="max-w-4xl mx-auto px-8 py-24 sm:py-32 text-center">
        <span className="text-accent font-display italic text-xl block mb-6">The Provocation</span>
        <h2 className="font-display text-3xl sm:text-4xl text-foreground mb-8 tracking-tight leading-snug">
          Every ingredient tells a story. We provide the stage and the spotlight.
        </h2>
        <p className="text-muted-foreground leading-relaxed max-w-[65ch] mx-auto">
          Rooted in Aurora, Ohio, VPS Finest reclaims the art of the gathering. From intimate dinners to grand celebrations, we treat every plate as a cinematic protagonist — and every host as our guest.
        </p>
      </section>

      {/* Pathway Cards */}
      <section className="max-w-7xl mx-auto px-8 pb-24 sm:pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <Link to="/quote" className="group">
            <div className="relative aspect-[4/5] overflow-hidden mb-6 bg-muted">
              <img
                src={heroCatering}
                alt="Browse recipes"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-foreground/10 group-hover:bg-transparent transition-colors" />
            </div>
            <div className="flex justify-between items-end border-b border-foreground/10 pb-4">
              <div>
                <p className="text-[10px] tracking-widest text-muted-foreground mb-2">THE SERVICE</p>
                <h3 className="font-display text-3xl">Build a Quote</h3>
              </div>
              <span className="text-sm italic font-display group-hover:translate-x-2 transition-transform">
                Begin →
              </span>
            </div>
          </Link>

          <Link to="/quote/ai" className="group">
            <div className="relative aspect-[4/5] overflow-hidden mb-6 bg-muted">
              <img
                src={heroCatering}
                alt="Explore catering"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-foreground/10 group-hover:bg-transparent transition-colors" />
            </div>
            <div className="flex justify-between items-end border-b border-foreground/10 pb-4">
              <div>
                <p className="text-[10px] tracking-widest text-muted-foreground mb-2">THE COLLABORATION</p>
                <h3 className="font-display text-3xl">Plan with AI</h3>
              </div>
              <span className="text-sm italic font-display group-hover:translate-x-2 transition-transform">
                Inquire →
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Divider */}
      <div className="flex justify-center items-center py-12">
        <div className="size-1.5 rounded-full bg-accent" />
        <div className="w-32 h-px bg-foreground/10" />
        <div className="size-1.5 rounded-full bg-accent" />
      </div>

      <PublicFooter />
    </div>
  );
}
