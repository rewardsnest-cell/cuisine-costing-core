import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type AssetEvent,
  clearAssetEvents,
  getAssetEvents,
  subscribeAssetEvents,
} from "@/lib/asset-debug";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, HelpCircle, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/asset-debug")({
  component: AssetDebugPage,
});

function statusBadge(status: AssetEvent["status"]) {
  if (status === "ok")
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-3 h-3 mr-1" /> ok
      </Badge>
    );
  if (status === "missing")
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
        <HelpCircle className="w-3 h-3 mr-1" /> missing
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      <AlertCircle className="w-3 h-3 mr-1" /> error
    </Badge>
  );
}

function AssetDebugPage() {
  const [events, setEvents] = useState<AssetEvent[]>(() => getAssetEvents());

  useEffect(() => {
    const unsub = subscribeAssetEvents(() => setEvents(getAssetEvents()));
    return unsub;
  }, []);

  const errors = events.filter((e) => e.status === "error");
  const missing = events.filter((e) => e.status === "missing");
  const ok = events.filter((e) => e.status === "ok");

  // Unique failing slugs for quick scan
  const failingSlugs = Array.from(new Set([...errors, ...missing].map((e) => e.slug)));

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Asset Debug</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Live log of <code>site_asset_manifest</code> queries made by this browser session.
            Use it to identify slugs that fail RLS, return no row, or hit a client/network error.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => clearAssetEvents()}>
          <Trash2 className="w-4 h-4 mr-2" /> Clear
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="OK" value={ok.length} tone="ok" />
        <Stat label="Missing" value={missing.length} tone="warn" />
        <Stat label="Errors" value={errors.length} tone="bad" />
      </div>

      {failingSlugs.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive mb-2">
            Failing slugs ({failingSlugs.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {failingSlugs.map((s) => (
              <code key={s} className="text-xs bg-background border border-border rounded px-2 py-0.5">
                {s}
              </code>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Slug</th>
              <th className="text-left px-3 py-2 font-medium">URL / Error</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No asset queries recorded yet. Visit pages that load site assets
                  (home, catering, weddings) and they'll appear here.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-border align-top">
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {new Date(e.at).toLocaleTimeString()}
                </td>
                <td className="px-3 py-2">{statusBadge(e.status)}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.slug}</td>
                <td className="px-3 py-2 text-xs break-all">
                  {e.status === "error" ? (
                    <span className="text-destructive">{e.error}</span>
                  ) : e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {e.url}
                    </a>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">{e.error || "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "bad" }) {
  const color =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
