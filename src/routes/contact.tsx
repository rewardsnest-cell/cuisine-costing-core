import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { GuaranteeBadge } from "@/components/GuaranteeBadge";
import { toast } from "sonner";

const INQUIRY_TYPES = [
  { id: "wedding", label: "Wedding", helper: "Plated, family-style, or buffet — tasting included." },
  { id: "event", label: "Event / Private", helper: "Corporate, parties, showers, private dinners." },
  { id: "tasting", label: "Tasting", helper: "Try the food before you book." },
  { id: "general", label: "Just say hi", helper: "A question, a thank-you, anything else." },
] as const;
type InquiryType = typeof INQUIRY_TYPES[number]["id"];

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
  const [inquiryType, setInquiryType] = useState<InquiryType>("wedding");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const showEventFields = inquiryType === "wedding" || inquiryType === "event";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in name, email, and a short message.");
      return;
    }
    setSubmitting(true);
    try {
      const composed = [
        `[${INQUIRY_TYPES.find((t) => t.id === inquiryType)?.label} inquiry]`,
        showEventFields && eventDate ? `Date: ${eventDate}` : "",
        showEventFields && guestCount ? `Guests: ${guestCount}` : "",
        "",
        message,
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message: composed }),
      });
      if (!res.ok) throw new Error("Failed");
      setSent(true);
      setName(""); setEmail(""); setEventDate(""); setGuestCount(""); setMessage("");
      toast.success("Message sent. We'll be in touch shortly.");
    } catch {
      toast.error("Something went wrong. Please email hello@vpsfinest.com directly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-10 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Contact</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            Let's talk.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            Wedding catering, event catering, or a tasting in Aurora and Northeast Ohio — we reply within one business day.
          </p>
          <div className="mt-6 flex justify-center">
            <GuaranteeBadge />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="max-w-xl mx-auto px-6">
          {sent ? (
            <div className="border-t border-border pt-10 text-center">
              <p className="font-display text-2xl text-foreground mb-3">Thank you.</p>
              <p className="text-muted-foreground font-light">Your message is on its way. We'll reply within one business day.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="border-t border-border pt-10 space-y-7">
              {/* Inquiry type selector — routes the lead correctly */}
              <div>
                <label className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">What's this about?</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {INQUIRY_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInquiryType(t.id)}
                      className={`text-xs px-3 py-2.5 rounded-md border transition-colors ${
                        inquiryType === t.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 font-light">
                  {INQUIRY_TYPES.find((t) => t.id === inquiryType)?.helper}
                </p>
              </div>

              <div>
                <label htmlFor="name" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Name</label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required disabled={submitting} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground" />
              </div>
              <div>
                <label htmlFor="email" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Email</label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required disabled={submitting} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground" />
              </div>

              {showEventFields && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="event-date" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Date <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span></label>
                    <Input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={submitting} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground" />
                  </div>
                  <div>
                    <label htmlFor="guest-count" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Guests <span className="normal-case tracking-normal text-muted-foreground/70">(approx)</span></label>
                    <Input id="guest-count" type="number" min={1} max={2000} value={guestCount} onChange={(e) => setGuestCount(e.target.value)} disabled={submitting} className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground" />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="message" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">Message</label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  required
                  disabled={submitting}
                  rows={5}
                  className="bg-transparent border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground resize-none"
                  placeholder={
                    inquiryType === "wedding" ? "Venue, style (plated/buffet/family-style), and anything else that helps." :
                    inquiryType === "event" ? "Venue, type of event, and anything else that helps." :
                    inquiryType === "tasting" ? "A few dates that might work and what you're hoping to try." :
                    "Tell us anything."
                  }
                />
              </div>
              <div className="pt-2">
                <Button type="submit" disabled={submitting} className="rounded-md px-8">
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
    </div>
  );
}
