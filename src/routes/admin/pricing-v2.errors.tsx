import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileJson, RefreshCw } from "lucide-react";
import {
  listPricingV2Errors,
  PRICING_V2_STAGES,
} from "@/lib/server-fns/pricing-v2.functions";

export const Route = createFileRoute("/admin/pricing-v2/errors")({
  head: () => ({ meta: [{ title: "Pricing v2 — Errors" }] }),
  component: PricingV2ErrorsPage,
});

const SEVERITIES = ["info", "warning", "error", "critical"] as const;

function PricingV2ErrorsPage() {
  const [stage, setStage] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [selected, setSelected] = useState<any | null>(null);

  const errors = useQuery({
    queryKey: ["pricing-v2", "errors", stage, severity, type],
    queryFn: () =>
      listPricingV2Errors({
        data: {
          stage: stage || undefined,
          severity: severity || undefined,
          type: type || undefined,
          limit: 500,
        },
      }),
  });

  const rows = errors.data?.errors ?? [];

  const exportCsv = () => {
    const cols = ["created_at", "stage", "severity", "type", "entity_type", "entity_id", "message", "suggested_fix"];
    const lines = [cols.join(",")];
    for (const r of rows) {
      lines.push(cols.map((c) => JSON.stringify(r[c] ?? "")).join(","));
    }
    download("pricing-v2-errors.csv", lines.join("\n"), "text/csv");
  };
  const exportJson = () => {
    download("pricing-v2-errors.json", JSON.stringify(rows, null, 2), "application/json");
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Pricing v2 — Errors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uniform error log across all pipeline stages.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => errors.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson}>
            <FileJson className="w-4 h-4 mr-2" /> JSON
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">All stages</option>
            {PRICING_V2_STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input
            placeholder="Filter by type (substring)…"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Errors
            <Badge variant="secondary" className="ml-auto">
              {rows.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {errors.isLoading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No errors match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Stage</th>
                    <th className="text-left px-3 py-2">Severity</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Entity</th>
                    <th className="text-left px-3 py-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr
                      key={r.id}
                      className="border-t border-border/40 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setSelected(r)}
                    >
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.stage}</td>
                      <td className="px-3 py-2"><SeverityBadge sev={r.severity} /></td>
                      <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.entity_type ? `${r.entity_type}:${r.entity_id ?? "—"}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs truncate max-w-[400px]">
                        {r.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Error detail
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Message:</span> {selected.message}</div>
            <div>
              <span className="text-muted-foreground">Suggested fix:</span>{" "}
              {selected.suggested_fix ?? <em className="text-muted-foreground">none</em>}
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Debug payload:</div>
              <pre className="bg-muted/40 rounded-md p-3 text-xs overflow-x-auto">
                {JSON.stringify(selected.debug_json ?? {}, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SeverityBadge({ sev }: { sev: string }) {
  const variant: any =
    sev === "critical" || sev === "error" ? "destructive" :
    sev === "warning" ? "outline" : "secondary";
  return <Badge variant={variant}>{sev}</Badge>;
}

function download(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
