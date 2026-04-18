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
      <section className="pt-24 pb-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-primary text-xs tracking-widest uppercase mb-3">Contact</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-primary mb-6">Let's talk.</h1>
        <div className="space-y-4 text-lg text-muted-foreground leading-relaxed">
          <p>For catering, weddings, or tastings — email us and we'll be in touch within one business day.</p>
          <p>
            <a href="mailto:hello@vpsfinest.com" className="text-primary underline">hello@vpsfinest.com</a>
          </p>
          <p className="text-sm">Aurora, Ohio · Serving Northeast Ohio</p>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
