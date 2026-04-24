import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SIDES_AND_EXTRAS, type QuoteSelections, type Step } from "./types";
import { usePricingVisibility } from "@/lib/use-pricing-visibility";

interface Props {
  selections: QuoteSelections;
  setSelections: React.Dispatch<React.SetStateAction<QuoteSelections>>;
  setStep: (s: Step) => void;
}

export function QuoteStepExtras({ selections, setSelections, setStep }: Props) {
  usePricingVisibility();
  const showPricing = false;
  const toggle = (id: string) => {
    setSelections((s) => ({
      ...s,
      extras: s.extras.includes(id) ? s.extras.filter((x) => x !== id) : [...s.extras, id],
    }));
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Sides & Extras</h1>
      <p className="text-muted-foreground mb-8">Add courses and beverages{showPricing ? " (per guest pricing)" : ""}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SIDES_AND_EXTRAS.map((item) => (
          <Card
            key={item.id}
            className={`cursor-pointer transition-all ${selections.extras.includes(item.id) ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
            onClick={() => toggle(item.id)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1">
                <h3 className="font-medium text-sm">{item.label}</h3>
                {showPricing && <p className="text-xs text-muted-foreground">+${item.price}/guest</p>}
              </div>
              {selections.extras.includes(item.id) && (
                <span className="text-primary font-bold">✓</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={() => setStep("recipes")}>Back</Button>
        <Button onClick={() => setStep("addons")} className="bg-gradient-warm text-primary-foreground">Next</Button>
      </div>
    </div>
  );
}
