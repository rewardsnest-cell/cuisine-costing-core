import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { generateQuotePDF } from "@/lib/generate-quote-pdf";
import { useAuth } from "@/hooks/use-auth";
import { Download, Send, CheckCircle, RotateCcw, Link as LinkIcon, LogIn, Sparkles, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import {
  type Step,
  STEPS,
  MENU_STYLES,
  PROTEINS,
  ALLERGIES,
  SIDES_AND_EXTRAS,
  ADDONS,
  TIERS,
  SERVICE_STYLES,
  PRICE_PER_DISH,
  INITIAL_SELECTIONS,
} from "@/components/quote/types";
import { QuoteStepService } from "@/components/quote/QuoteStepService";
import { QuoteStepExtras } from "@/components/quote/QuoteStepExtras";
import { QuoteStepAddons } from "@/components/quote/QuoteStepAddons";
import { QuoteStepTier } from "@/components/quote/QuoteStepTier";

export const Route = createFileRoute("/quote")({
  head: () => ({
    meta: [
      { title: "Build Your Catering Quote — TasteQuote" },
      { name: "description", content: "Create a customized catering proposal with our interactive quote builder." },
    ],
  }),
  component: QuotePage,
});

function QuotePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("style");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selections, setSelections] = useState({ ...INITIAL_SELECTIONS });

  // Hydrate from AI handoff
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("quote_handoff");
      if (!raw) return;
      const data = JSON.parse(raw);
      sessionStorage.removeItem("quote_handoff");
      setSelections((s) => ({ ...s, ...data }));
      const jumpReview = sessionStorage.getItem("quote_handoff_jump_review");
      if (jumpReview) {
        sessionStorage.removeItem("quote_handoff_jump_review");
        setStep("review");
        return;
      }
      if (!data.style) setStep("style");
      else if (!data.proteins?.length) setStep("protein");
      else if (!data.serviceStyle) setStep("service");
      else if (!data.tier) setStep("tier");
      else if (!data.clientName || !data.clientEmail || !data.eventDate) setStep("details");
      else setStep("review");
    } catch {}
  }, []);

  const switchToAI = () => {
    sessionStorage.setItem("quote_handoff", JSON.stringify(selections));
    navigate({ to: "/quote/ai" });
  };

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

  const selectedTier = TIERS.find((t) => t.id === selections.tier) || TIERS[0];
  const dishTotal = selections.guestCount * selections.proteins.length * PRICE_PER_DISH;
  const extrasTotal = selections.extras.reduce((sum, id) => {
    const item = SIDES_AND_EXTRAS.find((e) => e.id === id);
    return sum + (item ? item.price * selections.guestCount : 0);
  }, 0);
  const addonsTotal = selections.addons.reduce((sum, id) => {
    const item = ADDONS.find((a) => a.id === id);
    return sum + (item ? item.price * selections.guestCount : 0);
  }, 0);
  const subtotal = (dishTotal + extrasTotal + addonsTotal) * selectedTier.multiplier;
  const totalAmount = Math.round(subtotal);

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

  const [submittedQuoteId, setSubmittedQuoteId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data } = await (supabase as any).from("quotes").insert({
        client_name: selections.clientName,
        client_email: selections.clientEmail,
        event_type: selections.eventType,
        event_date: selections.eventDate || null,
        guest_count: selections.guestCount,
        location_name: selections.locationName || null,
        location_address: selections.locationAddress || null,
        dietary_preferences: {
          allergies: selections.allergies,
          style: selections.style,
          proteins: selections.proteins,
          serviceStyle: selections.serviceStyle,
          extras: selections.extras,
          addons: selections.addons,
          tier: selections.tier,
        },
        subtotal: totalAmount,
        total: totalAmount * 1.08,
        status: "draft",
        user_id: user?.id || null,
      }).select("id, reference_number").single();
      if (data?.reference_number) setReferenceNumber(data.reference_number);
      if (data?.id) {
        setSubmittedQuoteId(data.id);
        // Track guest quote in localStorage so it can be auto-linked after login/signup
        if (!user?.id && typeof window !== "undefined") {
          try {
            const existing = JSON.parse(localStorage.getItem("guest_quote_ids") || "[]");
            if (!existing.includes(data.id)) {
              existing.push(data.id);
              localStorage.setItem("guest_quote_ids", JSON.stringify(existing));
            }
          } catch {}
        }
      }
      if (user?.id) setLinked(true);
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkToAccount = async () => {
    if (!user || !submittedQuoteId) return;
    setLinking(true);
    await supabase.from("quotes").update({ user_id: user.id }).eq("id", submittedQuoteId);
    setLinked(true);
    setLinking(false);
  };

  const currentIdx = STEPS.indexOf(step);
  const progress = ((currentIdx + 1) / STEPS.length) * 100;

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="pt-24 pb-16 px-4">
          <div className="max-w-lg mx-auto text-center">
            <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Quote Submitted!</h1>
            {referenceNumber && (
              <div className="bg-muted rounded-lg p-4 mb-4">
                <p className="text-xs text-muted-foreground mb-1">Your reference number</p>
                <p className="font-mono text-2xl font-bold text-primary">{referenceNumber}</p>
                <p className="text-xs text-muted-foreground mt-1">Save this to look up your quote anytime</p>
              </div>
            )}
            <p className="text-muted-foreground mb-6">We'll review your request and get back to you within 24 hours.</p>
            {!linked && !user && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-foreground mb-2">Save this quote to an account?</p>
                <p className="text-xs text-muted-foreground mb-3">Create an account or sign in — your quote will be automatically linked so you can manage it later.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Link to="/signup"><Button size="sm" className="bg-gradient-warm text-primary-foreground gap-1"><LogIn className="w-3 h-3" /> Sign Up</Button></Link>
                  <Link to="/login"><Button size="sm" variant="outline" className="gap-1"><LogIn className="w-3 h-3" /> Sign In</Button></Link>
                  <Button size="sm" variant="ghost" onClick={() => setLinked(true)}>Continue as Guest</Button>
                </div>
              </div>
            )}
            {!linked && user && submittedQuoteId && (
              <Button onClick={handleLinkToAccount} disabled={linking} className="bg-gradient-warm text-primary-foreground gap-2 mb-6">
                <LinkIcon className="w-4 h-4" /> {linking ? "Linking..." : "Link to My Account"}
              </Button>
            )}
            {linked && (
              <p className="text-sm text-primary font-medium mb-6">✓ Linked to your account</p>
            )}
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
      <div className="pt-24 pb-32 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Mode header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Badge variant="secondary" className="gap-1">Basic Builder</Badge>
            <button onClick={switchToAI} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Switch to Advanced AI <ArrowLeftRight className="w-3 h-3" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-warm rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-muted-foreground">Step {currentIdx + 1} of {STEPS.length}</p>
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
                    <CardContent className="p-5 flex items-center justify-between">
                      <h3 className="font-medium">{p}</h3>
                      {selections.proteins.includes(p) && <span className="text-primary font-bold text-lg">✓</span>}
                    </CardContent>
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
                <Button onClick={() => setStep("service")} className="bg-gradient-warm text-primary-foreground">Next</Button>
              </div>
            </div>
          )}

          {step === "service" && <QuoteStepService selections={selections} setSelections={setSelections} setStep={setStep} />}
          {step === "extras" && <QuoteStepExtras selections={selections} setSelections={setSelections} setStep={setStep} />}
          {step === "addons" && <QuoteStepAddons selections={selections} setSelections={setSelections} setStep={setStep} />}
          {step === "tier" && <QuoteStepTier selections={selections} setSelections={setSelections} setStep={setStep} />}

          {step === "details" && (
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">Event Details</h1>
              <p className="text-muted-foreground mb-8">Tell us about your event</p>
              <div className="space-y-4">
                <div><Label>Your Name</Label><Input value={selections.clientName} onChange={(e) => setSelections((s) => ({ ...s, clientName: e.target.value }))} placeholder="Jane Smith" /></div>
                <div><Label>Email</Label><Input type="email" value={selections.clientEmail} onChange={(e) => setSelections((s) => ({ ...s, clientEmail: e.target.value }))} placeholder="jane@company.com" /></div>
                <div><Label>Event Type</Label><Input value={selections.eventType} onChange={(e) => setSelections((s) => ({ ...s, eventType: e.target.value }))} placeholder="Corporate Gala, Wedding, etc." /></div>
                <div><Label>Venue / Location Name</Label><Input value={selections.locationName} onChange={(e) => setSelections((s) => ({ ...s, locationName: e.target.value }))} placeholder="The Grand Ballroom" /></div>
                <div><Label>Venue Address</Label><Input value={selections.locationAddress} onChange={(e) => setSelections((s) => ({ ...s, locationAddress: e.target.value }))} placeholder="123 Main St, City, State" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Guest Count</Label><Input type="number" value={selections.guestCount} onChange={(e) => setSelections((s) => ({ ...s, guestCount: parseInt(e.target.value) || 0 }))} /></div>
                  <div><Label>Event Date</Label><Input type="date" value={selections.eventDate} onChange={(e) => setSelections((s) => ({ ...s, eventDate: e.target.value }))} /></div>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <Button variant="outline" onClick={() => setStep("tier")}>Back</Button>
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
                  <div className="border-t pt-4 grid grid-cols-2 gap-4">
                    <div><p className="text-sm text-muted-foreground mb-1">Menu Style</p><p className="font-medium capitalize">{selections.style}</p></div>
                    <div><p className="text-sm text-muted-foreground mb-1">Service</p><p className="font-medium capitalize">{SERVICE_STYLES.find((s) => s.id === selections.serviceStyle)?.label || "—"}</p></div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-2">Selected Dishes</p>
                    <ul className="space-y-1">{selections.proteins.map((p) => (<li key={p} className="text-sm font-medium">• {p}</li>))}</ul>
                  </div>
                  {selections.extras.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Sides & Extras</p>
                      <div className="flex flex-wrap gap-2">{selections.extras.map((id) => {
                        const item = SIDES_AND_EXTRAS.find((e) => e.id === id);
                        return item ? <span key={id} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium">{item.icon} {item.label}</span> : null;
                      })}</div>
                    </div>
                  )}
                  {selections.addons.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Add-ons</p>
                      <div className="flex flex-wrap gap-2">{selections.addons.map((id) => {
                        const item = ADDONS.find((a) => a.id === id);
                        return item ? <span key={id} className="px-2 py-0.5 bg-accent/20 text-accent-foreground text-xs rounded-full font-medium">{item.icon} {item.label}</span> : null;
                      })}</div>
                    </div>
                  )}
                  {selections.allergies.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Allergen Accommodations</p>
                      <div className="flex flex-wrap gap-2">{selections.allergies.map((a) => (<span key={a} className="px-2 py-0.5 bg-destructive/10 text-destructive text-xs rounded-full font-medium">{a}</span>))}</div>
                    </div>
                  )}
                  <div className="border-t pt-4 grid grid-cols-2 gap-4">
                    <div><p className="text-sm text-muted-foreground mb-1">Event</p><p className="text-sm">{selections.eventType || "—"} · {selections.eventDate || "TBD"}</p></div>
                    <div><p className="text-sm text-muted-foreground mb-1">Tier</p><p className="text-sm font-semibold">{selectedTier.icon} {selectedTier.label}</p></div>
                  </div>
                  <div className="border-t pt-4 bg-muted/50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
                    <div className="space-y-1 text-sm mb-3">
                      <div className="flex justify-between"><span className="text-muted-foreground">Main dishes ({selections.proteins.length}×{selections.guestCount} guests)</span><span>${dishTotal.toLocaleString()}</span></div>
                      {extrasTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Sides & extras</span><span>${extrasTotal.toLocaleString()}</span></div>}
                      {addonsTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Add-ons</span><span>${addonsTotal.toLocaleString()}</span></div>}
                      {selectedTier.multiplier > 1 && <div className="flex justify-between"><span className="text-muted-foreground">{selectedTier.label} tier ({selectedTier.multiplier}x)</span><span className="text-xs">applied</span></div>}
                    </div>
                    <div className="flex justify-between items-center border-t pt-3">
                      <span className="font-display text-lg font-semibold">Estimated Total</span>
                      <span className="font-display text-2xl font-bold text-gradient-gold">${totalAmount.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">+8% tax applied at checkout</p>
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
      {step !== "review" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-lg">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Estimated · {selections.guestCount} guests · {selectedTier.icon} {selectedTier.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-gradient-gold">${totalAmount.toLocaleString()}</span>
                {selections.guestCount > 0 && totalAmount > 0 && (
                  <span className="text-xs text-muted-foreground">~${Math.round(totalAmount / selections.guestCount)}/guest</span>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setStep("review")} disabled={totalAmount === 0} className="shrink-0">
              Review
            </Button>
          </div>
        </div>
      )}
      <PublicFooter />
    </div>
  );
}
