import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  RefreshCw, ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/cron-runs")({
  head: () => ({
    meta: [
      { title: "Scheduled Job Runs — Admin" },
      { name: "description", content: "View every cron run with stage counts, queued/failed totals, and error details for the last 90 days." },
    ],
  }),
  component: CronRunsPage,
});

type Summary = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  total_runs: number;
  succeeded: number;
  failed: number;
  other: number;
  last_run: string | null;
  last_status: string | null;
  last_message: string | null;
  avg_duration_ms: number | null;
  failures_24h: number;
};

type Run = {
  runid: number;
  jobid: number;
  jobname: string;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
};

const WINDOWS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function CronRunsPage() {
  const [windowDays, setWindowDays] = useState(7);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState(200);
  const since = useMemo(
    () => new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString(),
    [windowDays],
  );

  const summaryQ = useQuery({
    queryKey: ["cron-summary", windowDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_cron_summary", { _since: since });
      if (error) throw error;
      return (data ?? []) as Summary[];
    },
  });

  const runsQ = useQuery({
    queryKey: ["cron-runs", windowDays, jobFilter, statusFilter, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_cron_runs", {
        _job_name: jobFilter === "all" ? null : jobFilter,
        _status: statusFilter === "all" ? null : statusFilter,
        _since: since,
        _limit: pageSize,
        _offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as Run[];
    },
  });

  const refetchAll = () => {
    summaryQ.refetch();
    runsQ.refetch();
  };

  const summary = summaryQ.data ?? [];
  const runs = runsQ.data ?? [];

  const totals = useMemo(() => {
    return summary.reduce(
      (acc, s) => {
        acc.total += Number(s.total_runs);
        acc.succeeded += Number(s.succeeded);
        acc.failed += Number(s.failed);
        acc.other += Number(s.other);
        acc.failures_24h += Number(s.failures_24h);
        return acc;
      },
      { total: 0, succeeded: 0, failed: 0, other: 0, failures_24h: 0 },
    );
  }, [summary]);

  const isLoading = summaryQ.isLoading || runsQ.isLoading;
  const error = summaryQ.error || runsQ.error;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link to="/admin/catering-contacts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Admin
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Scheduled Job Runs</h1>
          <p className="text-sm text-muted-foreground">
            All cron runs (succeeded, failed, queued) — keep tabs on background processing.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.days} value={String(w.days)}>Last {w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refetchAll} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            {(error as Error).message ?? "Failed to load cron data. Admin role required."}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <StatCard label="Total runs" value={totals.total} />
        <StatCard label="Succeeded" value={totals.succeeded} tone="success" />
        <StatCard label="Failed" value={totals.failed} tone={totals.failed > 0 ? "danger" : undefined} />
        <StatCard label="Other / queued" value={totals.other} tone={totals.other > 0 ? "warn" : undefined} />
        <StatCard label="Failures (24h)" value={totals.failures_24h} tone={totals.failures_24h > 0 ? "danger" : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-job summary ({windowDays}d)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summaryQ.isLoading ? (
            <LoadingState />
          ) : summary.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No scheduled jobs.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">OK</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">Avg ms</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((s) => (
                    <TableRow key={s.jobid}>
                      <TableCell>
                        <div className="font-medium">{s.jobname}</div>
                        {!s.active && <Badge variant="outline" className="mt-0.5">paused</Badge>}
                      </TableCell>
                      <TableCell><code className="text-xs">{s.schedule}</code></TableCell>
                      <TableCell className="text-right tabular-nums">{Number(s.total_runs).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">
                        {Number(s.succeeded).toLocaleString()}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", Number(s.failed) > 0 && "text-destructive font-medium")}>
                        {Number(s.failed).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {Number(s.other).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {s.avg_duration_ms != null ? Math.round(Number(s.avg_duration_ms)) : "—"}
                      </TableCell>
                      <TableCell>
                        {s.last_run ? (
                          <div className="text-xs">
                            <div className="inline-flex items-center gap-1">
                              <StatusIcon status={s.last_status} />
                              {formatDistanceToNow(new Date(s.last_run), { addSuffix: true })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setJobFilter(s.jobname); setStatusFilter("all"); }}
                        >
                          View runs
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Run history
          </CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Job</Label>
              <Select value={jobFilter} onValueChange={setJobFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All jobs</SelectItem>
                  {summary.map((s) => (
                    <SelectItem key={s.jobid} value={s.jobname}>{s.jobname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="starting">Starting</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Page size</Label>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[100, 200, 500, 1000].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {runsQ.isLoading ? (
            <LoadingState />
          ) : runs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No runs in this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => {
                    const isFail = r.status === "failed";
                    return (
                      <TableRow key={r.runid} className={cn(isFail && "bg-destructive/5")}>
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm">{format(new Date(r.start_time), "MMM d, HH:mm:ss")}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(r.start_time), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{r.jobname}</span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            <StatusIcon status={r.status} />
                            <span className="text-sm capitalize">{r.status}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {r.duration_ms != null ? `${Math.round(Number(r.duration_ms))} ms` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className={cn("text-xs font-mono whitespace-pre-wrap break-words max-w-xl", isFail && "text-destructive")}>
                            {r.return_message || "—"}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {runs.length === pageSize && (
                <div className="p-3 text-xs text-center text-muted-foreground border-t">
                  Showing the most recent {pageSize} runs. Increase page size or narrow the filters to see more.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "warn" | "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn(
          "text-2xl font-semibold tabular-nums mt-1",
          tone === "success" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
          tone === "danger" && "text-destructive",
        )}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "running" || status === "starting") return <Clock className="h-3.5 w-3.5 text-amber-600" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
}
