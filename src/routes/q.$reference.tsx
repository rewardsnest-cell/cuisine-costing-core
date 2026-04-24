import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const QUOTE_STATES = [
  {
    key: "initiated",
    label: "Started",
    description: "Your details are with us. Nothing to action yet.",
  },
  {
    key: "info_collected",
    label: "Details collected",
    description: "We have what we need to begin shaping your event.",
  },
  {
    key: "structured",
    label: "Structured",
    description: "Your event is taking shape. We're refining the menu and service plan.",
  },
  {
    key: "awaiting_pricing",
    label: "Ready for proposal",
    description: "Structure is set. Our team is preparing your formal proposal.",
  },
] as const;

type QuoteRow = {
  reference_number: string;
  client_name: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  location_name: string | null;
  status: string;
  quote_state: (typeof QUOTE_STATES)[number]["key"];
  is_test: boolean;
  created_at: string;
  updated_at: string;
  dietary_preferences: any;
};

export const Route = createFileRoute("/q/$reference")({
  head: ({ params }) => ({
    meta: [
      { title: `Quote ${params.reference} — VPS Finest` },
      {
        name: "description",
        content:
          "Track the progress of your VPS Finest catering quote. Calm, professional updates as we shape your event.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ params }) => {
    const { data, error } = await (supabase as any).rpc("get_quote_by_reference", {
      _reference: params.reference,
    });
    if (error) {
      console.error("Quote lookup failed:", error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw notFound();
    return { quote: row as QuoteRow };
  },
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-foreground font-medium">We couldn't load this quote</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              variant="outline"
              size="sm"
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  },
  notFoundComponent: () => {
    const params = Route.useParams();
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <div>
              <p className="font-display text-lg font-semibold mb-1">Quote not found</p>
              <p className="text-sm text-muted-foreground">
                We couldn't find a quote with reference{" "}
                <span className="font-mono">{params.reference}</span>. Double-check the
                link, or look it up by email.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Link to="/lookup">
                <Button variant="outline" size="sm">
                  Look up by email
                </Button>
              </Link>
              <Link to="/">
                <Button size="sm">Return home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  },
  component: SharedQuotePage,
});

function SharedQuotePage() {
  const { quote } = Route.useLoaderData() as { quote: QuoteRow };
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

  const currentIdx = Math.max(
    0,
    QUOTE_STATES.findIndex((s) => s.key === quote.quote_state),
  );
  const intake = quote.dietary_preferences?.intake || {};

  const copyLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied", { description: "You can share this link with anyone." });
  };

  const copyReference = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(quote.reference_number);
    toast.success("Reference copied");
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="pt-28 md:pt-32 pb-20 px-4">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            VPS Finest
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary">Quote progress</Badge>
              {quote.is_test && (
                <Badge variant="outline" className="border-dashed text-muted-foreground">
                  Test
                </Badge>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-3">
              Your quote is in progress
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              This page reflects the current state of your quote with our team. There's no
              action required — we'll be in touch as your event takes shape.
            </p>
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Reference
                  </p>
                  <p className="font-mono text-xl font-semibold text-foreground">
                    {quote.reference_number}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={copyReference} variant="outline" size="sm" className="gap-1.5">
                    <Copy className="w-3.5 h-3.5" /> Reference
                  </Button>
                  <Button onClick={copyLink} variant="outline" size="sm" className="gap-1.5">
                    <Copy className="w-3.5 h-3.5" /> Link
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-border">
                <Detail label="Client" value={quote.client_name || "—"} />
                <Detail label="Event type" value={quote.event_type || "Not set"} />
                <Detail
                  label="Event date"
                  value={quote.event_date ? formatDate(quote.event_date) : "Not set"}
                />
                <Detail
                  label="Guest count"
                  value={intake.guestRange || (quote.guest_count > 1 ? String(quote.guest_count) : "Not set")}
                />
                {(intake.venue || quote.location_name) && (
                  <Detail
                    label="Venue"
                    value={
                      intake.venueNotBooked
                        ? "Not booked yet"
                        : intake.venue || quote.location_name || "—"
                    }
                  />
                )}
                <Detail label="Started" value={formatDate(quote.created_at)} />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="font-display text-lg font-semibold mb-5">Where things stand</h2>
              <ol className="space-y-4">
                {QUOTE_STATES.map((state, idx) => {
                  const completed = idx < currentIdx;
                  const current = idx === currentIdx;
                  return (
                    <li key={state.key} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={[
                            "w-7 h-7 rounded-full border flex items-center justify-center text-xs font-medium",
                            completed
                              ? "bg-primary border-primary text-primary-foreground"
                              : current
                                ? "border-primary text-primary bg-background"
                                : "border-border text-muted-foreground bg-background",
                          ].join(" ")}
                        >
                          {completed ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                        </div>
                        {idx < QUOTE_STATES.length - 1 && (
                          <div
                            className={[
                              "w-px flex-1 mt-1",
                              completed ? "bg-primary/40" : "bg-border",
                            ].join(" ")}
                          />
                        )}
                      </div>
                      <div className={current ? "pb-4" : "pb-4 opacity-70"}>
                        <p
                          className={[
                            "font-medium text-sm",
                            current ? "text-foreground" : completed ? "text-foreground" : "text-muted-foreground",
                          ].join(" ")}
                        >
                          {state.label}
                          {current && (
                            <span className="ml-2 text-xs font-normal text-primary">Current</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">{state.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="font-display text-lg font-semibold mb-3">A note on pricing</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We share an itemized proposal only after your event is clearly structured.
                That keeps the figure accurate and meaningful, rather than a guess. There's
                nothing to commit to until you've reviewed everything.
              </p>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-8">
            This link is private to anyone you share it with. No payment, deposit, or commitment
            is requested at this stage.
          </p>
        </div>
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

function formatDate(input: string) {
  try {
    const d = new Date(input);
    if (isNaN(d.getTime())) return input;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return input;
  }
}
