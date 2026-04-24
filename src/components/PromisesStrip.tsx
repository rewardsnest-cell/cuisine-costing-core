import { ClipboardList, Utensils, MapPin } from "lucide-react";

/**
 * Three operational promises — what makes VPS Finest easy to work with.
 */
export function PromisesStrip() {
  const promises = [
    {
      Icon: ClipboardList,
      title: "Itemized quotes",
      body: "Food, service, rentals, and setup broken out line by line. In writing, before you commit.",
    },
    {
      Icon: Utensils,
      title: "Tastings before you book",
      body: "Weddings include a tasting. You taste the menu before you sign anything.",
    },
    {
      Icon: MapPin,
      title: "Aurora-based, NE Ohio served",
      body: "Hudson, Cleveland, Akron, and venues across the region we work in every weekend.",
    },
  ];

  return (
    <section className="py-20 bg-secondary border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          {promises.map(({ Icon, title, body }) => (
            <div key={title} className="text-center">
              <div className="w-11 h-11 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
