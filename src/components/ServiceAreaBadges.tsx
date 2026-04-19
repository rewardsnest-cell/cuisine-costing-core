import { MapPin } from "lucide-react";

const AREAS = ["Aurora", "Hudson", "Cleveland", "Akron", "Northeast Ohio"] as const;

interface Props {
  /** "light" for use on dark backgrounds. */
  tone?: "default" | "light";
  className?: string;
}

/** Subtle social-proof: serving Aurora, Hudson, Cleveland & Northeast Ohio. */
export function ServiceAreaBadges({ tone = "default", className = "" }: Props) {
  const isLight = tone === "light";
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase ${
          isLight ? "text-background/70" : "text-muted-foreground"
        }`}
      >
        <MapPin className={`w-3 h-3 ${isLight ? "text-background/70" : "text-accent"}`} />
        Serving
      </span>
      {AREAS.map((a) => (
        <span
          key={a}
          className={`px-2.5 py-1 rounded-full text-[11px] tracking-wide border transition-colors ${
            isLight
              ? "border-background/30 text-background/85"
              : "border-border text-muted-foreground bg-card/50"
          }`}
        >
          {a}
        </span>
      ))}
    </div>
  );
}
