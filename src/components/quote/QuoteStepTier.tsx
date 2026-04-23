import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { TIERS, SIDES_AND_EXTRAS, ADDONS, PRICE_PER_DISH, type QuoteSelections, type Step } from "./types";
import { usePricingVisibility } from "@/lib/use-pricing-visibility";

interface Props {
  selections: QuoteSelections;
  setSelections: React.Dispatch<React.SetStateAction<QuoteSelections>>;
  setStep: (s: Step) => void;
}

export function QuoteStepTier({ selections, setSelections, setStep }: Props) {
  const { showPricing } = usePricingVisibility();
  const guests = Math.max(selections.guestCount || 0, 1);
  const dishPerGuest = selections.proteins.length * PRICE_PER_DISH;
  const extrasPerGuest = selections.extras.reduce((sum, id) => {
    const item = SIDES_AND_EXTRAS.find((e) => e.id === id);
    return sum + (item ? item.price : 0);
  }, 0);
  const addonsPerGuest = selections.addons.reduce((sum, id) => {
    const item = ADDONS.find((a) => a.id === id);
    return sum + (item ? item.price : 0);
  }, 0);
  const basePerGuest = dishPerGuest + extrasPerGuest + addonsPerGuest;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Choose Your Service Tier</h1>
      <p className="text-muted-foreground mb-2">Each tier sets the quality of ingredients, serviceware, and staffing for your event.</p>
      <p className="text-xs text-muted-foreground mb-8">The tier multiplier is applied to your subtotal — Silver is the base price, Gold is +35%, Platinum is +75%.</p>
      <div className="grid grid-cols-1 gap-4">
        {TIERS.map((t) => {
          const selected = selections.tier === t.id;
          const perGuest = basePerGuest * t.multiplier;
          const tierTotal = Math.round(perGuest * guests);
          return (
            <Card
              key={t.id}
              className={`cursor-pointer transition-all ${selected ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
              onClick={() => setSelections((prev) => ({ ...prev, tier: t.id }))}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-3">
                  <span className="text-4xl leading-none">{t.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl font-bold">{t.label}</h3>
                      <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {t.multiplier === 1 ? "Base price" : `+${Math.round((t.multiplier - 1) * 100)}%`}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
                    {showPricing && basePerGuest > 0 && (
                      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                        <span className="font-display text-2xl font-bold text-primary">~${perGuest.toFixed(0)}</span>
                        <span className="text-xs text-muted-foreground">/ guest</span>
                        <span className="text-xs text-muted-foreground">· est. ${tierTotal.toLocaleString()} total for {guests} guests</span>
                      </div>
                    )}
                  </div>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground/90">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={() => setStep("addons")}>Back</Button>
        <Button onClick={() => setStep("details")} className="bg-gradient-warm text-primary-foreground">Continue</Button>
      </div>
    </div>
  );
}
