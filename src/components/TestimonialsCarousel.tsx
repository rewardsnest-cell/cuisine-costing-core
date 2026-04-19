import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTIMONIALS = [
  {
    quote: "They handled every detail of our wedding so calmly. The food was the best part of the night — our guests are still talking about it.",
    name: "Sarah & Michael",
    location: "Aurora, OH",
  },
  {
    quote: "Honest pricing and zero surprises. The quote we got was exactly what we paid. Rare these days.",
    name: "Jennifer K.",
    location: "Hudson, OH",
  },
  {
    quote: "From tasting to teardown, they were a true partner. We actually got to enjoy our own party.",
    name: "David R.",
    location: "Cleveland, OH",
  },
  {
    quote: "Beautiful presentation, generous portions, and the kindest team. We'd hire them again in a heartbeat.",
    name: "The Patel Family",
    location: "Akron, OH",
  },
];

export function TestimonialsCarousel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIALS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const t = TESTIMONIALS[idx];

  return (
    <div className="mt-16 max-w-3xl mx-auto">
      <Card className="border-border bg-background">
        <CardContent className="p-8 sm:p-10 text-center">
          <Quote className="w-8 h-8 mx-auto text-primary opacity-60 mb-4" aria-hidden />
          <p className="text-lg sm:text-xl text-foreground leading-relaxed font-light italic min-h-[6rem]">
            "{t.quote}"
          </p>
          <p className="mt-6 text-sm font-medium text-foreground">{t.name}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{t.location}</p>
        </CardContent>
      </Card>
      <div className="flex items-center justify-center gap-3 mt-5">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          onClick={() => setIdx((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
          aria-label="Previous testimonial"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex gap-1.5">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to testimonial ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          onClick={() => setIdx((i) => (i + 1) % TESTIMONIALS.length)}
          aria-label="Next testimonial"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
