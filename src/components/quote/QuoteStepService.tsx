import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SERVICE_STYLES, type QuoteSelections, type Step } from "./types";

interface Props {
  selections: QuoteSelections;
  setSelections: React.Dispatch<React.SetStateAction<QuoteSelections>>;
  setStep: (s: Step) => void;
}

export function QuoteStepService({ selections, setSelections, setStep }: Props) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Choose Service Style</h1>
      <p className="text-muted-foreground mb-8">How would you like the meal served?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SERVICE_STYLES.map((s) => (
          <Card
            key={s.id}
            className={`cursor-pointer transition-all hover:shadow-warm ${selections.serviceStyle === s.id ? "ring-2 ring-primary shadow-warm" : "hover:border-primary/30"}`}
            onClick={() => { setSelections((prev) => ({ ...prev, serviceStyle: s.id })); setStep("recipes"); }}
          >
            <CardContent className="p-6">
              <div className="text-3xl mb-3">{s.icon}</div>
              <h3 className="font-display text-lg font-semibold">{s.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={() => setStep("dietary")}>Back</Button>
      </div>
    </div>
  );
}
