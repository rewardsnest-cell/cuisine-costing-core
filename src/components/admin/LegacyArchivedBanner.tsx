import { AlertTriangle } from "lucide-react";

export function LegacyArchivedBanner() {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-sm">
        <div className="font-semibold text-amber-700 dark:text-amber-400">
          LEGACY / ARCHIVED — Do not use for current pricing
        </div>
        <div className="text-amber-700/80 dark:text-amber-400/80">
          This page belonged to Pricing v1 and is kept read-only for reference.
          Use <code className="mx-1">/admin/pricing</code> for the active workflow.
        </div>
      </div>
    </div>
  );
}
