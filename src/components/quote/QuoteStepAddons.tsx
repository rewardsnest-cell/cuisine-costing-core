import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ADDONS, type QuoteSelections, type Step } from "./types";

interface Props {
  selections: QuoteSelections;
  setSelections: React.Dispatch<React.SetStateAction<QuoteSelections>>;
  setStep: (s: Step) => void;
}

export function QuoteStepAddons({ selections, setSelections, setStep }: Props) {
  const toggle = (id: string) => {
    setSelections((s) => ({
      ...s,
      addons: s.addons.includes(id) ? s.addons.filter((x) => x !== id) : [...s.addons, id],
    }));
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Add-ons & Upgrades</h1>
      <p className="text-muted-foreground mb-8">Enhance your event experience (per guest pricing)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ADDONS.map((item) => (
          <Card
            key={item.id}
            className={`cursor-pointer transition-all ${selections.addons.includes(item.id) ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
            onClick={() => toggle(item.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div className="flex-1">
                  <h3 className="font-medium text-sm">{item.label}</h3>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                  <p className="text-xs font-semibold text-primary mt-1">+${item.price}/guest</p>
                </div>
                {selections.addons.includes(item.id) && (
                  <span className="text-primary font-bold">✓</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={() => setStep("extras")}>Back</Button>
        <Button onClick={() => setStep("tier")} className="bg-gradient-warm text-primary-foreground">Next</Button>
      </div>
    </div>
  );
}
