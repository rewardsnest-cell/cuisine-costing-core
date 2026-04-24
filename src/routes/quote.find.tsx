import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/quote/find")({
  head: () => ({
    meta: [
      { title: "Find your quote — VPS Finest" },
      {
        name: "description",
        content:
          "Enter your VPS Finest quote reference number to view its current progress. No pricing is shown — just a calm status update on where your event stands.",
      },
      // Private status lookup — keep out of indexes
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Find your quote — VPS Finest" },
      {
        property: "og:description",
        content: "Look up the progress of your VPS Finest catering quote by reference number.",
      },
    ],
  }),
  component: FindQuotePage,
});

// Reference numbers are short, alphanumeric (e.g., TQ-XXXXXX or VF-XXXXXX).
// Validate strictly to keep junk inputs from hitting the RPC.
const refSchema = z
  .string()
  .trim()
  .min(4, { message: "Reference looks too short." })
  .max(32, { message: "Reference looks too long." })
  .regex(/^[A-Za-z0-9-]+$/, { message: "Use letters, numbers, and dashes only." });

function FindQuotePage() {
  const navigate = useNavigate();
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = refSchema.safeParse(reference);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please enter a valid reference.");
      return;
    }

    const cleaned = parsed.data.toUpperCase();
    setChecking(true);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc(
        "get_quote_by_reference",
        { _reference: cleaned },
      );
      if (rpcError) {
        console.error(rpcError);
        setError("We couldn't look that up just now. Please try again in a moment.");
        return;
      }
      const found = Array.isArray(data) ? data[0] : data;
      if (!found) {
        setError(
          "We couldn't find a quote with that reference. Double-check the characters, or contact us if you'd like help.",
        );
        return;
      }
      navigate({ to: "/q/$reference", params: { reference: cleaned } });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <section className="max-w-xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-4">
            Quote lookup
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Find your quote.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Enter the reference number from your quote confirmation. You'll see the current
            stage of your event — no pricing, no commitment.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div>
                <Label htmlFor="reference" className="text-sm">
                  Quote reference
                </Label>
                <div className="mt-2 relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="reference"
                    name="reference"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="e.g. TQ-AB12CD"
                    value={reference}
                    onChange={(e) => {
                      setReference(e.target.value);
                      if (error) setError(null);
                    }}
                    maxLength={32}
                    className="pl-9 font-mono uppercase tracking-wider"
                    aria-invalid={!!error}
                    aria-describedby={error ? "reference-error" : "reference-hint"}
                  />
                </div>
                {error ? (
                  <p id="reference-error" className="text-sm text-destructive mt-2">
                    {error}
                  </p>
                ) : (
                  <p id="reference-hint" className="text-xs text-muted-foreground mt-2">
                    Your reference was shown on the confirmation screen and any link we shared with you.
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={checking || reference.trim().length === 0}
                className="w-full gap-2"
              >
                {checking ? "Looking up…" : "View progress"}
                {!checking && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-border/70 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The lookup is read-only and never reveals pricing. It only shows the structural
                progress of your quote so you know what stage your event is in.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8 space-y-2">
          <p className="text-sm text-muted-foreground">
            Don't have a reference yet?{" "}
            <Link to="/quote/start" className="text-primary hover:underline">
              Start a quote
            </Link>
            .
          </p>
          <p className="text-sm text-muted-foreground">
            Need help finding it?{" "}
            <Link to="/contact" className="text-primary hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
