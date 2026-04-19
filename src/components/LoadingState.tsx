import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  label?: string;
  /** Show as full-screen centered overlay */
  fullScreen?: boolean;
  /** Compact inline variant (no progress bar) */
  inline?: boolean;
}

/**
 * Reusable loading indicator with an animated indeterminate progress bar.
 * The bar slowly creeps toward 90% to signal "still working" without ever
 * claiming completion.
 */
export function LoadingState({ label = "Loading…", fullScreen = false, inline = false }: LoadingStateProps) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + Math.max(1, (90 - p) * 0.08)));
    }, 400);
    return () => clearInterval(id);
  }, []);

  if (inline) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{label}</span>
      </div>
    );
  }

  const content = (
    <div className="w-full max-w-sm space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{label}</span>
      </div>
      <Progress value={progress} />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        {content}
      </div>
    );
  }

  return <div className="py-8 flex justify-center">{content}</div>;
}
