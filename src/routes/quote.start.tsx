import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy, ArrowRight, Sparkles, Share2, Link2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quote/start")({
  head: () => ({
    meta: [
      { title: "Start a Quote — VPS Finest" },
      {
        name: "description",
        content:
          "Begin your catering quote with VPS Finest. We'll structure your event details first — no commitment, no pricing pressure.",
      },
    ],
  }),
  component: QuoteStartPage,
});

const intakeSchema = z.object({
  clientName: z.string().trim().min(1, "Please enter your name").max(120),
  clientEmail: z.string().trim().email("Please enter a valid email").max(255),
  eventType: z.string().max(60).optional(),
  eventDate: z.string().max(20).optional(),
  guestRange: z.string().max(40).optional(),
  venue: z.string().max(160).optional(),
});

const GUEST_RANGES = [
  "Not sure yet",
  "Up to 25",
  "25–50",
  "50–100",
  "100–175",
  "175–250",
  "250+",
];

const EVENT_TYPES = [
  "Wedding",
  "Corporate event",
  "Private celebration",
  "Other",
];

function QuoteStartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    eventType: "",
    eventDate: "",
    guestRange: "",
    venue: "",
    budgetRange: "",
  });
  const [venueNotBooked, setVenueNotBooked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: keyof typeof form, v: string) => {
    setForm((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      venue: venueNotBooked ? "Not booked yet" : form.venue,
    };
    const parsed = intakeSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string;
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const data = parsed.data;
      const intake = {
        guestRange: data.guestRange || null,
        venue: data.venue || null,
        venueNotBooked,
        budgetRange: data.budgetRange || null,
        sourcePage: "quote/start",
      };
      const { data: row, error } = await (supabase as any)
        .from("quotes")
        .insert({
          client_name: data.clientName,
          client_email: data.clientEmail,
          event_type: data.eventType || null,
          event_date: data.eventDate || null,
          guest_count: 1, // placeholder; real range stored in dietary_preferences.intake
          dietary_preferences: { intake },
          quote_state: "initiated",
          status: "draft",
          user_id: user?.id || null,
        })
        .select("id, reference_number")
        .single();
      if (error) throw error;
      if (row?.reference_number) setReferenceNumber(row.reference_number);
      if (row?.id) {
        setQuoteId(row.id);
        if (!user?.id && typeof window !== "undefined") {
          try {
            const existing = JSON.parse(localStorage.getItem("guest_quote_ids") || "[]");
            if (!existing.includes(row.id)) {
              existing.push(row.id);
              localStorage.setItem("guest_quote_ids", JSON.stringify(existing));
            }
          } catch {}
        }
      }
      setSubmitted(true);
    } catch (err) {
      console.error("Quote intake error:", err);
      toast.error("We couldn't save your request", {
        description: "Please try again in a moment, or email us directly.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <main className="pt-28 md:pt-32 pb-20 px-4">
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" strokeWidth={1.5} />
              <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-3">
                Your quote has been started.
              </h1>
              <p className="text-muted-foreground">
                Thank you — we have your details. There's no commitment at this stage.
              </p>
            </div>

            {referenceNumber && (
              <Card className="mb-6">
                <CardContent className="p-6 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Your reference number
                  </p>
                  <p className="font-mono text-2xl font-semibold text-foreground mb-3">
                    {referenceNumber}
                  </p>
                  <button
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(referenceNumber);
                        toast.success("Reference copied");
                      }
                    }}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy reference
                  </button>
                  <p className="text-xs text-muted-foreground mt-3">
                    Save this — you can return to it anytime at <Link to="/lookup" className="underline">/lookup</Link>.
                  </p>
                </CardContent>
              </Card>
            )}

            {referenceNumber && (
              <Card className="mb-6 border-primary/20 bg-primary/5">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-3">
                    <Share2 className="w-5 h-5 text-primary mt-0.5" strokeWidth={1.75} />
                    <div className="flex-1">
                      <p className="font-medium text-foreground mb-1">Share your quote</p>
                      <p className="text-sm text-muted-foreground">
                        A read-only progress link. No pricing, no commitment — just the current state of your quote.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <code className="flex-1 text-xs font-mono px-3 py-2 bg-background border border-border rounded-md truncate">
                      {typeof window !== "undefined" ? `${window.location.origin}/q/${referenceNumber}` : `/q/${referenceNumber}`}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.clipboard && typeof window !== "undefined") {
                          navigator.clipboard.writeText(`${window.location.origin}/q/${referenceNumber}`);
                          toast.success("Share link copied");
                        }
                      }}
                      className="gap-1.5"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Copy link
                    </Button>
                    <Link to="/q/$reference" params={{ reference: referenceNumber }}>
                      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto">
                        Open
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mb-6">
              <CardContent className="p-6">
                <h2 className="font-display text-lg font-semibold mb-3">What happens next</h2>
                <ol className="space-y-2.5 text-sm text-foreground/85">
                  <li className="flex gap-3">
                    <span className="text-muted-foreground font-mono text-xs mt-0.5">01</span>
                    <span>You'll refine details next — service style, menu direction, and the components that fit your event.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-muted-foreground font-mono text-xs mt-0.5">02</span>
                    <span>Our team reviews the structure with you. Pricing comes later, once your event is clearly shaped.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-muted-foreground font-mono text-xs mt-0.5">03</span>
                    <span>You decide whether to move forward. No commitment until you're ready.</span>
                  </li>
                </ol>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  if (quoteId) {
                    try {
                      sessionStorage.setItem(
                        "quote_handoff",
                        JSON.stringify({
                          clientName: form.clientName,
                          clientEmail: form.clientEmail,
                          eventType: form.eventType,
                          eventDate: form.eventDate,
                          locationName: venueNotBooked ? "" : form.venue,
                        }),
                      );
                    } catch {}
                  }
                  navigate({ to: "/catering/quote" });
                }}
                className="flex-1 gap-2"
              >
                Continue refining details <ArrowRight className="w-4 h-4" />
              </Button>
              <Link to="/" className="flex-1">
                <Button variant="outline" className="w-full">
                  Return home
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="pt-28 md:pt-32 pb-20 px-4">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <Badge variant="secondary" className="mb-4">Step 1 of 2 · Intake</Badge>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-3">
              Start a quote
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              This starts your quote. You'll refine the details next — there's no commitment at this stage,
              and we don't ask for pricing decisions until your event is clearly structured.
            </p>
          </div>

          <Card>
            <CardContent className="p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label htmlFor="clientName">
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="clientName"
                    value={form.clientName}
                    onChange={(e) => update("clientName", e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    required
                  />
                  {errors.clientName && (
                    <p className="text-xs text-destructive mt-1">{errors.clientName}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="clientEmail">
                    Email address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => update("clientEmail", e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                  {errors.clientEmail && (
                    <p className="text-xs text-destructive mt-1">{errors.clientEmail}</p>
                  )}
                </div>

                <div className="pt-2">
                  <p className="text-sm font-medium text-foreground mb-1">A few optional details</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Anything you don't know yet, leave blank — we'll work through it together.
                  </p>
                </div>

                <div>
                  <Label>Event type <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Select value={form.eventType} onValueChange={(v) => update("eventType", v)}>
                    <SelectTrigger><SelectValue placeholder="Select if known" /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="eventDate">Event date <span className="text-muted-foreground font-normal">(if known)</span></Label>
                  <Input
                    id="eventDate"
                    type="date"
                    value={form.eventDate}
                    onChange={(e) => update("eventDate", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Guest count <span className="text-muted-foreground font-normal">(estimate)</span></Label>
                  <Select value={form.guestRange} onValueChange={(v) => update("guestRange", v)}>
                    <SelectTrigger><SelectValue placeholder="Select a range" /></SelectTrigger>
                    <SelectContent>
                      {GUEST_RANGES.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="venue">Venue <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="venue"
                    value={venueNotBooked ? "" : form.venue}
                    onChange={(e) => update("venue", e.target.value)}
                    placeholder="Venue name or city"
                    disabled={venueNotBooked}
                  />
                  <label className="flex items-center gap-2 mt-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={venueNotBooked}
                      onChange={(e) => setVenueNotBooked(e.target.checked)}
                      className="rounded border-input"
                    />
                    Not booked yet
                  </label>
                </div>

                <div>
                  <Label>Projected budget <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Select value={form.budgetRange} onValueChange={(v) => update("budgetRange", v)}>
                    <SelectTrigger><SelectValue placeholder="Not sure yet" /></SelectTrigger>
                    <SelectContent>
                      {BUDGET_RANGES.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    We don't share figures at this stage — this just helps us understand your starting point.
                  </p>
                </div>

                <div className="pt-3">
                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Starting your quote…" : "Start my quote"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    No commitment. We'll send a reference number you can return to anytime.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <Link
              to="/quote/ai"
              search={{ context: "" }}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Prefer to talk it through? Use our concierge instead
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
