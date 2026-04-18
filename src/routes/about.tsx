import { createFileRoute } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — VPS Finest" },
      { name: "description", content: "VPS Finest is a chef-led catering and recipe studio in Aurora, Ohio. Good food. No stress." },
      { property: "og:title", content: "About — VPS Finest" },
      { property: "og:description", content: "Chef-led catering and recipe studio in Aurora, Ohio." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="pt-24 pb-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-primary text-xs tracking-widest uppercase mb-3">About</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-6">Good food. No stress.</h1>
        <div className="space-y-5 text-lg text-muted-foreground leading-relaxed">
          <p>
            VPS Finest is a chef-led catering and recipe studio based in Aurora, Ohio.
            We cook for weddings, corporate events, and private gatherings across Northeast Ohio.
          </p>
          <p>
            Our approach is simple: real ingredients, transparent pricing, and a chef who actually
            answers your calls. We publish the recipes we cook at home, too.
          </p>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
