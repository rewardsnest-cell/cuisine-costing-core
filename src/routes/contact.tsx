import { createFileRoute } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — VPS Finest, Aurora Ohio" },
      { name: "description", content: "Get in touch with VPS Finest for catering, weddings, and tastings." },
      { property: "og:title", content: "Contact — VPS Finest" },
      { property: "og:description", content: "Get in touch for catering, weddings, and tastings." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Heading */}
      <section className="pt-32 pb-12 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Contact</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            Let's talk.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            For catering, weddings, or tastings — reach out and we'll be in touch within one business day.
          </p>
        </div>
      </section>

      {/* Contact details */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-6 grid gap-10 md:grid-cols-2 text-center">
          {[
            { k: "Email", v: "hello@vpsfinest.com", href: "mailto:hello@vpsfinest.com" },
            { k: "Service area", v: "Aurora, Ohio & Northeast Ohio", href: null },
          ].map((c) => (
            <div key={c.k} className="border-t border-border pt-8">
              <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">{c.k}</p>
              {c.href ? (
                <a href={c.href} className="font-display text-xl text-foreground hover:text-accent transition-colors">{c.v}</a>
              ) : (
                <p className="font-display text-xl text-foreground">{c.v}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
