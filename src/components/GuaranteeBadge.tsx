import { ShieldCheck } from "lucide-react";

/**
 * Subtle reassurance pill — itemized pricing, in writing.
 */
export function GuaranteeBadge({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-border bg-background/80 backdrop-blur-sm px-4 py-1.5 text-xs text-foreground ${className}`}>
      <ShieldCheck className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
      <span className="font-medium">Itemized quotes, in writing.</span>
    </div>
  );
}
