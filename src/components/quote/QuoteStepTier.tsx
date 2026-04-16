import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TIERS, type QuoteSelections, type Step } from "./types";

interface Props {
  selections: QuoteSelections;
  setSelections: React.Dispatch<React.SetStateAction<QuoteSelections>>;
  setStep: (s: Step) => void;
}

export function QuoteStepTier({ selections, setSelections, setStep }: Props) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Choose Your Tier</h1>
      <p className="text-muted-foreground mb-8">Select a package level that fits your budget and vision</p>
      <div className="grid grid-cols-1 gap-4">
        {TIERS.map((t) => (
          <Card
            key={t.id}
            className={`cursor-pointer transition-all ${selections.tier === t.id ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
            onClick={() => { setSelections((prev) => ({ ...prev, tier: t.id })); setStep("details"); }}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <span className="text-4xl">{t.icon}</span>
              <div className="flex-1">
                <h3 className="font-display text-xl font-bold">{t.label}</h3>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </div>
              {t.multiplier > 1 && (
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-full">
                  {t.multiplier}x
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={() => setStep("addons")}>Back</Button>
      </div>
    </div>
  );
}
