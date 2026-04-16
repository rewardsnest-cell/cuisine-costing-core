import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { generateQuotePDF } from "@/lib/generate-quote-pdf";
import { useAuth } from "@/hooks/use-auth";
import { Download, Send, CheckCircle, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/quote")({
  head: () => ({
    meta: [
      { title: "Build Your Catering Quote — TasteQuote" },
      { name: "description", content: "Create a customized catering proposal with our interactive quote builder." },
    ],
  }),
  component: QuotePage,
});

type Step = "style" | "protein" | "dietary" | "details" | "review";

const MENU_STYLES = [
  { id: "meat", label: "Meat & Poultry", icon: "🥩", desc: "Prime cuts, poultry, and charcuterie" },
  { id: "seafood", label: "Seafood", icon: "🦐", desc: "Fresh fish, shellfish, and ocean delicacies" },
  { id: "vegetarian", label: "Vegetarian", icon: "🥗", desc: "Plant-forward dishes with rich flavors" },
  { id: "mixed", label: "Mixed Menu", icon: "🍽️", desc: "The best of everything for all guests" },
];

const PROTEINS: Record<string, string[]> = {
  meat: ["Chicken", "Beef", "Pork", "Lamb"],
  seafood: ["Fish", "Shrimp", "Crab", "Lobster"],
  vegetarian: ["Tofu", "Mushroom", "Eggplant", "Cauliflower"],
  mixed: ["Chicken", "Beef", "Fish", "Tofu"],
};

const ALLERGIES = ["Gluten", "Dairy", "Nuts", "Shellfish", "Soy", "Eggs"];
const PRICE_PER_DISH = 35;

const INITIAL_SELECTIONS = {
  style: "",
  proteins: [] as string[],
  allergies: [] as string[],
  guestCount: 50,
  eventDate: "",
  eventType: "",
  clientName: "",
  clientEmail: "",
};

function QuotePage() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("style");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selections, setSelections] = useState({ ...INITIAL_SELECTIONS });

  const toggleProtein = (p: string) => {
    setSelections((s) => ({
      ...s,
      proteins: s.proteins.includes(p) ? s.proteins.filter((x) => x !== p) : [...s.proteins, p],
    }));
  };

  const toggleAllergy = (a: string) => {
    setSelections((s) => ({
      ...s,
      allergies: s.allergies.includes(a) ? s.allergies.filter((x) => x !== a) : [...s.allergies, a],
    }));
  };

  const startOver = () => {
    setSelections({ ...INITIAL_SELECTIONS });
    setStep("style");
    setSubmitted(false);
  };

  const totalAmount = selections.guestCount * selections.proteins.length * PRICE_PER_DISH;

  const handleDownloadPDF = () => {
    const doc = generateQuotePDF({
      clientName: selections.clientName,
      clientEmail: selections.clientEmail,
      eventType: selections.eventType,
      eventDate: selections.eventDate,
      guestCount: selections.guestCount,
      menuStyle: selections.style,
      proteins: selections.proteins,
      allergies: selections.allergies,
      pricePerDish: PRICE_PER_DISH,
    });
    doc.save(`TasteQuote-${selections.clientName || "Proposal"}.pdf`);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await supabase.from("quotes").insert({
        client_name: selections.clientName,
        client_email: selections.clientEmail,
        event_type: selections.eventType,
        event_date: selections.eventDate || null,
        guest_count: selections.guestCount,
        dietary_preferences: { allergies: selections.allergies, style: selections.style, proteins: selections.proteins },
        subtotal: totalAmount,
        total: totalAmount * 1.08,
        status: "draft",
        user_id: user?.id || null,
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const steps: Step[] = ["style", "protein", "dietary", "details", "review"];
  const currentIdx = steps.indexOf(step);
  const progress = ((currentIdx + 1) / steps.length) * 100;

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="pt-24 pb-16 px-4">
          <div className="max-w-lg mx-auto text-center">
            <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Quote Submitted!</h1>
            <p className="text-muted-foreground mb-8">We'll review your request and get back to you within 24 hours.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
                <Download className="w-4 h-4" /> Download PDF
              </Button>
              <Button onClick={startOver} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" /> Start Over
              </Button>
            </div>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-warm rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-muted-foreground">Step {currentIdx + 1} of {steps.length}</p>
              {currentIdx > 0 && (
                <button onClick={startOver} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Start Over
                </button>
              )}
            </div>
          </div>

          {step === "style" && (
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">Choose Your Menu Style</h1>
              <p className="text-muted-foreground mb-8">Select the cuisine direction for your event</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {MENU_STYLES.map((s) => (
                  <Card key={s.id} className={`cursor-pointer transition-all hover:shadow-warm ${selections.style === s.id ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
                    onClick={() => { setSelections((prev) => ({ ...prev, style: s.id })); setStep("protein"); }}>
                    <CardContent className="p-6">
                      <div className="text-3xl mb-3">{s.icon}</div>
                      <h3 className="font-display text-lg font-semibold">{s.label}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {step === "protein" && (
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">Select Your Proteins</h1>
              <p className="text-muted-foreground mb-8">Choose one or more main dishes</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(PROTEINS[selections.style] || []).map((p) => (
                  <Card key={p} className={`cursor-pointer transition-all ${selections.proteins.includes(p) ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
                    onClick={() => toggleProtein(p)}>
                    <CardContent className="p-5"><h3 className="font-medium">{p}</h3></CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex gap-3 mt-8">
                <Button variant="outline" onClick={() => setStep("style")}>Back</Button>
                <Button onClick={() => setStep("dietary")} disabled={selections.proteins.length === 0} className="bg-gradient-warm text-primary-foreground">Next</Button>
              </div>
            </div>
          )}

          {step === "dietary" && (
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">Dietary Restrictions</h1>
              <p className="text-muted-foreground mb-8">Select any allergies to accommodate</p>
              <div className="flex flex-wrap gap-3">
                {ALLERGIES.map((a) => (
                  <button key={a} onClick={() => toggleAllergy(a)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${selections.allergies.includes(a) ? "bg-destructive text-destructive-foreground border-destructive" : "bg-muted text-muted-foreground border-border hover:border-primary/30"}`}>
                    {a}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-8">
                <Button variant="outline" onClick={() => setStep("protein")}>Back</Button>
                <Button onClick={() => setStep("details")} className="bg-gradient-warm text-primary-foreground">Next</Button>
              </div>
            </div>
          )}

          {step === "details" && (
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">Event Details</h1>
              <p className="text-muted-foreground mb-8">Tell us about your event</p>
              <div className="space-y-4">
                <div><Label>Your Name</Label><Input value={selections.clientName} onChange={(e) => setSelections((s) => ({ ...s, clientName: e.target.value }))} placeholder="Jane Smith" /></div>
                <div><Label>Email</Label><Input type="email" value={selections.clientEmail} onChange={(e) => setSelections((s) => ({ ...s, clientEmail: e.target.value }))} placeholder="jane@company.com" /></div>
                <div><Label>Event Type</Label><Input value={selections.eventType} onChange={(e) => setSelections((s) => ({ ...s, eventType: e.target.value }))} placeholder="Corporate Gala, Wedding, etc." /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Guest Count</Label><Input type="number" value={selections.guestCount} onChange={(e) => setSelections((s) => ({ ...s, guestCount: parseInt(e.target.value) || 0 }))} /></div>
                  <div><Label>Event Date</Label><Input type="date" value={selections.eventDate} onChange={(e) => setSelections((s) => ({ ...s, eventDate: e.target.value }))} /></div>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <Button variant="outline" onClick={() => setStep("dietary")}>Back</Button>
                <Button onClick={() => setStep("review")} className="bg-gradient-warm text-primary-foreground">Review Quote</Button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">Your Quote Summary</h1>
              <p className="text-muted-foreground mb-8">Review your customized catering proposal</p>
              <Card className="shadow-warm">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div><p className="text-sm text-muted-foreground">Client</p><p className="font-semibold">{selections.clientName || "—"}</p></div>
                    <div className="text-right"><p className="text-sm text-muted-foreground">Guests</p><p className="font-semibold">{selections.guestCount}</p></div>
                  </div>
                  <div className="border-t pt-4"><p className="text-sm text-muted-foreground mb-2">Menu Style</p><p className="font-medium capitalize">{selections.style}</p></div>
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-2">Selected Dishes</p>
                    <ul className="space-y-1">{selections.proteins.map((p) => (<li key={p} className="text-sm font-medium">• {p}</li>))}</ul>
                  </div>
                  {selections.allergies.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Allergen Accommodations</p>
                      <div className="flex flex-wrap gap-2">{selections.allergies.map((a) => (<span key={a} className="px-2 py-0.5 bg-destructive/10 text-destructive text-xs rounded-full font-medium">{a}</span>))}</div>
                    </div>
                  )}
                  <div className="border-t pt-4"><p className="text-sm text-muted-foreground mb-2">Event</p><p className="text-sm">{selections.eventType || "—"} · {selections.eventDate || "TBD"}</p></div>
                  <div className="border-t pt-4 bg-muted/50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-display text-lg font-semibold">Estimated Total</span>
                      <span className="font-display text-2xl font-bold text-gradient-gold">${totalAmount.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Based on ${PRICE_PER_DISH}/person per dish selection</p>
                  </div>
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-3 mt-8">
                <Button variant="outline" onClick={() => setStep("details")}>Back</Button>
                <Button variant="outline" onClick={handleDownloadPDF} className="gap-2"><Download className="w-4 h-4" /> Download PDF</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="bg-gradient-warm text-primary-foreground gap-2">
                  <Send className="w-4 h-4" /> {submitting ? "Submitting..." : "Submit Quote Request"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
