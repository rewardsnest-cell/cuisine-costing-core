// Bootstrap Run Details — surfaces the exact Supabase update error and
// enum/constraint mismatch when a run fails to finalize.
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2, ShieldAlert, Bug } from "lucide-react";
import { getCatalogRunDetails } from "@/lib/server-fns/pricing-v2-catalog.functions";

type Props = {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BootstrapRunDetailsDialog({ runId, open, onOpenChange }: Props) {
  const q = useQuery({
    queryKey: ["pricing-v2", "catalog", "run-details", runId],
    queryFn: () => getCatalogRunDetails({ data: { run_id: runId! } }),
    enabled: !!runId && open,
  });

  const data = q.data;
  const run = data?.run;
  const diag = data?.diagnosis;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            Bootstrap Run Details
            {run && (
              <Badge
                variant={
                  run.status === "success"
                    ? "default"
                    : run.status === "running"
                      ? "secondary"
                      : "destructive"
                }
              >
                {run.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">
            {runId}
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="py-10 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading run details…
          </div>
        ) : q.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Failed to load run</AlertTitle>
            <AlertDescription>{(q.error as any)?.message ?? "Unknown error"}</AlertDescription>
          </Alert>
        ) : !data || !run || !diag ? null : (
          <div className="space-y-4">
            {/* Diagnosis banner */}
            <Alert
              variant={diag.kind === "ok" ? "default" : "destructive"}
              className={
                diag.kind === "ok"
                  ? "border-success/40"
                  : diag.kind === "auto_recovered"
                    ? "border-amber-500/60"
                    : ""
              }
            >
              {diag.kind === "ok" ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : diag.kind === "auto_recovered" ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <AlertTitle className="flex items-center gap-2 flex-wrap">
                {diag.title}
                <Badge variant="outline" className="font-mono text-[10px]">
                  {diag.kind}
                </Badge>
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="whitespace-pre-wrap break-words text-xs">{diag.details}</p>
                {diag.suggested_fix && (
                  <p className="text-xs">
                    <span className="font-semibold">Suggested fix:</span> {diag.suggested_fix}
                  </p>
                )}
                {(diag.offending_value || diag.allowed_values) && (
                  <div className="text-[11px] font-mono space-y-0.5">
                    {diag.offending_value && (
                      <div>
                        offending value:{" "}
                        <span className="bg-destructive/10 text-destructive px-1 rounded">
                          {diag.offending_value}
                        </span>
                      </div>
                    )}
                    {diag.allowed_values && (
                      <div>
                        allowed:{" "}
                        {diag.allowed_values.map((v) => (
                          <span key={v} className="bg-muted px-1 rounded mr-1">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>

            {/* Last error verbatim */}
            <section className="space-y-1">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                last_error (verbatim from pricing_v2_runs)
              </h4>
              <pre className="text-[11px] bg-muted/40 rounded p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {run.last_error || "— (no last_error captured)"}
              </pre>
            </section>

            {/* Run metadata */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Stat label="stage" value={run.stage} />
              <Stat label="status" value={run.status} />
              <Stat label="started" value={fmt(run.started_at)} />
              <Stat label="ended" value={fmt(run.ended_at)} />
              <Stat label="counts_in" value={run.counts_in} />
              <Stat label="counts_out" value={run.counts_out} />
              <Stat label="warnings" value={run.warnings_count} />
              <Stat label="errors" value={run.errors_count} />
            </section>

            {/* Allowed enum reference */}
            <section className="text-[11px] space-y-1">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                allowed enum values (server schema)
              </h4>
              <div className="font-mono">
                run_status:{" "}
                {data.enums.run_status.map((v) => (
                  <span
                    key={v}
                    className={`px-1 rounded mr-1 ${run.status === v ? "bg-primary/15 text-primary" : "bg-muted"}`}
                  >
                    {v}
                  </span>
                ))}
              </div>
              <div className="font-mono">
                severity:{" "}
                {data.enums.severity.map((v) => (
                  <span key={v} className="bg-muted px-1 rounded mr-1">
                    {v}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground">
                If <span className="font-mono">last_error</span> mentions an "invalid input value
                for enum", the offending value above is not in this list — update the writer to
                use one of these exact strings.
              </p>
            </section>

            {/* Errors for this run */}
            <section className="space-y-1">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                pricing_v2_errors for this run ({data.errors.length})
              </h4>
              {data.errors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No error rows logged.</p>
              ) : (
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-[11px]">
                    <thead className="text-left text-muted-foreground bg-muted/40">
                      <tr>
                        <th className="px-2 py-1">severity</th>
                        <th className="px-2 py-1">type</th>
                        <th className="px-2 py-1">message</th>
                        <th className="px-2 py-1">entity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errors.map((e: any) => (
                        <tr key={e.id} className="border-t align-top">
                          <td className="px-2 py-1">
                            <Badge
                              variant={e.severity === "error" || e.severity === "critical" ? "destructive" : "outline"}
                            >
                              {e.severity}
                            </Badge>
                          </td>
                          <td className="px-2 py-1 font-mono whitespace-nowrap">{e.type}</td>
                          <td className="px-2 py-1 max-w-[40ch]">
                            <div className="truncate" title={e.message}>{e.message}</div>
                            {e.suggested_fix && (
                              <div className="text-muted-foreground italic">{e.suggested_fix}</div>
                            )}
                          </td>
                          <td className="px-2 py-1 font-mono text-muted-foreground">
                            {e.entity_type ? `${e.entity_type}:${e.entity_id ?? "—"}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Raw params */}
            {run.params && Object.keys(run.params).length > 0 && (
              <section className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">params</h4>
                <pre className="text-[11px] bg-muted/40 rounded p-2 max-h-40 overflow-auto">
                  {JSON.stringify(run.params, null, 2)}
                </pre>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-md px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">{value ?? "—"}</div>
    </div>
  );
}

function fmt(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : "—";
}
