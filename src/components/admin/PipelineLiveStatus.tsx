// Live job status panel for the Pricing v2 pipeline.
// Polls every 4s and shows per-stage progress, counts, and error totals.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getPipelineLiveStatus } from "@/lib/server-fns/pricing-v2.functions";

type Stage = Awaited<ReturnType<typeof getPipelineLiveStatus>>["stages"][number];

export function PipelineLiveStatus() {
  const q = useQuery({
    queryKey: ["pricing-v2", "live-status"],
    queryFn: () => getPipelineLiveStatus(),
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  const stages = q.data?.stages ?? [];
  const anyRunning = stages.some((s) => s.is_running);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Live Job Status
          {anyRunning && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> running
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {q.data?.generated_at && (
            <span>updated {new Date(q.data.generated_at).toLocaleTimeString()}</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="h-7 px-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stages found.</p>
        ) : (
          stages.map((s) => <StageRow key={s.key} stage={s} />)
        )}
      </CardContent>
    </Card>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  const last = stage.last_run;
  const status = last?.status ?? "never_run";
  const statusBadge = renderStatus(status, stage.is_running);

  return (
    <div className="border border-border/60 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{stage.label}</span>
            {statusBadge}
            {stage.errors_7d > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {stage.errors_7d} err / 7d
              </Badge>
            )}
            {stage.warnings_7d > 0 && (
              <Badge variant="outline" className="text-amber-700">
                {stage.warnings_7d} warn / 7d
              </Badge>
            )}
          </div>
          {last?.started_at && (
            <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2 items-center">
              <Clock className="w-3 h-3" />
              last started {new Date(last.started_at).toLocaleString()}
              {last.ended_at && (
                <> · took {fmtDuration(last.started_at, last.ended_at)}</>
              )}
            </div>
          )}
        </div>
        <Link
          to="/admin/pricing-v2/errors"
          search={{ stage: stage.key } as any}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          view errors →
        </Link>
      </div>

      {stage.progress && stage.progress.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              progress {stage.progress.current.toLocaleString()} /{" "}
              {stage.progress.total.toLocaleString()}
            </span>
            <span>{stage.progress.pct}%</span>
          </div>
          <Progress value={stage.progress.pct} className="h-1.5" />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric
          label="UPCs mapped"
          value={
            stage.key === "catalog"
              ? `${(stage as any).inventory_mapped?.toLocaleString() ?? 0} / ${(stage as any).inventory_total?.toLocaleString() ?? 0}`
              : "—"
          }
          hint={stage.key === "catalog" ? "inventory_items.kroger_product_id" : undefined}
        />
        <Metric
          label="Fetched products"
          value={
            stage.key === "catalog"
              ? ((stage as any).raw_rows_written ?? 0).toLocaleString()
              : last?.counts_in?.toLocaleString() ?? "—"
          }
        />
        <Metric
          label="Rows written"
          value={
            stage.key === "catalog"
              ? ((stage as any).normalized_rows_written ?? 0).toLocaleString()
              : last?.counts_out?.toLocaleString() ?? "—"
          }
        />
        <Metric
          label="Last run errors"
          value={`${last?.errors_count ?? 0}E / ${last?.warnings_count ?? 0}W`}
          tone={
            (last?.errors_count ?? 0) > 0
              ? "danger"
              : (last?.warnings_count ?? 0) > 0
                ? "warn"
                : "ok"
          }
        />
      </div>

      {last?.last_error && (
        <p className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1 truncate">
          last error: {last.last_error}
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="bg-muted/30 rounded-md px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono text-sm font-medium ${toneClass}`}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground font-mono">{hint}</div>}
    </div>
  );
}

function renderStatus(status: string, isRunning: boolean) {
  if (isRunning) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> running
      </Badge>
    );
  }
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="gap-1 bg-success/15 text-success hover:bg-success/15">
          <CheckCircle2 className="w-3 h-3" /> success
        </Badge>
      );
    case "failed":
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="w-3 h-3" /> failed
        </Badge>
      );
    case "never_run":
      return <Badge variant="outline">never run</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function fmtDuration(startIso: string, endIso: string) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
