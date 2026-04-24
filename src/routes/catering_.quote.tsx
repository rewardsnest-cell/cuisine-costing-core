import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ListChecks, ArrowRight } from "lucide-react";
import { QuotePage } from "./quote";

export const Route = createFileRoute("/catering_/quote")({
  head: () => ({
    meta: [
      { title: "Build Your Catering Quote — VPS Finest" },
      { name: "description", content: "Create a customized catering proposal in minutes. Aurora, Ohio." },
      { property: "og:title", content: "Build Your Catering Quote — VPS Finest" },
      { property: "og:description", content: "Create a customized catering proposal in minutes. Aurora, Ohio." },
    ],
  }),
  component: CateringQuoteChooser,
});

function CateringQuoteChooser() {
  // If a handoff exists (from /menu selections or AI flow), skip the chooser.
  const [mode, setMode] = useState<"chooser" | "basic">(() => {
    if (typeof window === "undefined") return "chooser";
    try {
      return sessionStorage.getItem("quote_handoff") ? "basic" : "chooser";
    } catch {
      return "chooser";
    }
  });
  const navigate = useNavigate();

  if (mode === "basic") return <QuotePage />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
              Build Your Catering Quote
            </h1>
            <p className="text-muted-foreground text-lg">
              Choose how you'd like to design your event menu.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card
              className="cursor-pointer transition-all hover:shadow-warm hover:border-primary/40 group"
              onClick={() => setMode("basic")}
            >
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center">
                    <ListChecks className="w-5 h-5 text-foreground" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold">Quick Builder</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Step through a guided wizard — pick your style, proteins, service, and extras. Fastest way to a quote.
                </p>
                <Button className="w-full bg-gradient-warm text-primary-foreground gap-2 group-hover:translate-x-0.5 transition-transform">
                  Start Quick Builder <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:shadow-warm hover:border-primary/40 group ring-1 ring-primary/20"
              onClick={() => navigate({ to: "/quote/ai", search: { context: "" } })}
            >
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg bg-gradient-warm flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold">AI Concierge</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Chat with our AI catering concierge. It asks thoughtful questions and designs a tailored menu with you.
                </p>
                <Button variant="outline" className="w-full gap-2 group-hover:translate-x-0.5 transition-transform">
                  Start AI Chat <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            Already have a reference number? <Link to="/lookup" className="text-primary hover:underline">Look up your quote</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
