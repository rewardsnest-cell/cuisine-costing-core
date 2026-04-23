import { ClipboardList, Utensils, MapPin } from "lucide-react";

/**
 * Three calm promise tiles — the differentiators that matter most:
 * itemized pricing, tastings included, and local-to-NE-Ohio.
 */
export function PromisesStrip() {
  const promises = [
    {
      Icon: ClipboardList,
      title: "Itemized pricing",
      body: "Every quote breaks out food, service, rentals, and setup. No mystery line items.",
    },
    {
      Icon: Utensils,
      title: "Tastings included",
      body: "Weddings include a tasting before you book. Try the food before you commit.",
    },
    {
      Icon: MapPin,
      title: "Aurora-based, NE Ohio served",
      body: "Hudson, Cleveland, Akron, and venues across the region we know well.",
    },
  ];

  return (
    <section className="py-16 bg-secondary border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          {promises.map(({ Icon, title, body }) => (
            <div key={title} className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light max-w-xs mx-auto">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
