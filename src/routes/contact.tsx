import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact VPS Finest — Catering in Aurora, Ohio" },
      { name: "description", content: "Contact VPS Finest about wedding catering, event catering, or a tasting in Aurora, Ohio and Northeast Ohio. We reply within one business day." },
      { property: "og:title", content: "Contact VPS Finest — Catering in Aurora, Ohio" },
      { property: "og:description", content: "Reach out about weddings, event catering, or a tasting. We reply within one business day." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error("Failed");
      setSent(true);
      setName("");
      setEmail("");
      setMessage("");
      toast.success("Message sent. We'll be in touch shortly.");
    } catch {
      toast.error("Something went wrong. Please email hello@vpsfinest.com directly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="pt-32 pb-12 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Contact</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            Let's talk.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            For wedding catering, event catering, or a tasting in Aurora, Ohio and Northeast Ohio — send us a note and we'll reply within one business day.
          </p>
        </div>
      </section>

      <section className="pb-16">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="sr-only">Send us a message</h2>
          {sent ? (
            <div className="border-t border-border pt-10 text-center">
              <p className="font-display text-2xl text-foreground mb-3">Thank you.</p>
              <p className="text-muted-foreground font-light">Your message is on its way. We'll reply within one business day.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="border-t border-border pt-10 space-y-6">
              <div>
                <label htmlFor="name" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Name</label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required disabled={submitting} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground" />
              </div>
              <div>
                <label htmlFor="email" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Email</label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required disabled={submitting} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground" />
              </div>
              <div>
                <label htmlFor="message" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Message</label>
                <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} required disabled={submitting} rows={5} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground resize-none" placeholder="Date, venue, guest count, and anything else that helps." />
              </div>
              <div className="pt-4">
                <Button type="submit" disabled={submitting} className="rounded-none px-8">
                  {submitting ? "Sending…" : "Send message"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-6 grid gap-10 md:grid-cols-2 text-center">
          {[
            { k: "Email", v: "hello@vpsfinest.com", href: "mailto:hello@vpsfinest.com" },
            { k: "Service area", v: "Aurora, Ohio · Northeast Ohio", href: null },
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
