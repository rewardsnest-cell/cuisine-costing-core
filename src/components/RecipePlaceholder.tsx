import { ChefHat } from "lucide-react";

/** Friendly fallback shown when a recipe has no image yet. */
export function RecipePlaceholder({ className = "", label = "Photo coming soon" }: { className?: string; label?: string }) {
  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-muted via-muted/70 to-muted/50 text-muted-foreground/70 ${className}`}
      aria-label={label}
    >
      <ChefHat className="w-10 h-10 mb-2 opacity-60" />
      <span className="text-[10px] tracking-[0.2em] uppercase font-medium">{label}</span>
    </div>
  );
}
