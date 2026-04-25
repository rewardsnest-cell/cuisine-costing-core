import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  MapPin, TrendingUp, ServerCrash, PlayCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/kroger-validation")({
  head: () => ({
    meta: [
      { title: "Kroger Validation — Admin" },
      {
        name: "description",
        content:
          "Nightly validation of Kroger pricing pipeline: missing ZIP locations, outlier medians, and failed signal refreshes.",
      },
    ],
  }),
  component: KrogerValidationPage,
});

type RunSummary = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  triggered_by: string | null;
  missing_zip_count: number;
  outlier_median_count: number;
  failed_refresh_count: number;
  total_anomalies: number;
  message: string | null;
};

type Anomaly = {
  id: string;
  run_id: string;
  category: "missing_zip" | "outlier_median" | "failed_refresh" | string;
  severity: "info" | "warning" | "error" | string;
  subject_type: string | null;
  subject_id: string | null;
  message: string;
  details: Record<string, any>;
  created_at: string;
};

const CATEGORY_META: Record<string, { label: string; icon: any; tone: string }> = {
  missing_zip: { label: "Missing ZIP mapping", icon: MapPin, tone: "text-warning" },
  outlier_median: { label: "Outlier median", icon: TrendingUp, tone: "text-destructive" },
  failed_refresh: { label: "Failed refresh", icon: ServerCrash, tone: "text-destructive" },
};

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "error")
    return (
      <Badge className="bg-destructive/15 text-destructive border border-destructive/30 gap-1">
        <XCircle className="w-3 h-3" /> error
      </Badge>
    );
  if (severity === "warning")
    return (
      <Badge className="bg-warning/15 text-warning border border-warning/30 gap-1">
        <AlertTriangle className="w-3 h-3" /> warning
      </Badge>
    );
  return <Badge variant="outline">{severity}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success")
    return (
      <Badge className="bg-success/15 text-success border border-success/30 gap-1">
        <CheckCircle2 className="w-3 h-3" /> success
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="bg-destructive/15 text-destructive border border-destructive/30 gap-1">
        <XCircle className="w-3 h-3" /> error
      </Badge>
    );
  if (status === "running")
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> running
      </Badge>
    );
  return <Badge variant="outline">{status}</Badge>;
}

function StatTile({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: number; tone: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg bg-muted flex items-center justify-center", tone)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function KrogerValidationPage() {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const runsQ = useQuery({
    queryKey: ["kroger-validation-runs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_kroger_validation_summary", { _limit: 30 });
      if (error) throw error;
      return (data as RunSummary[]) ?? [];
    },
  });

  const activeRunId = useMemo(() => {
    if (selectedRunId) return selectedRunId;
    return runsQ.data?.[0]?.id ?? null;
  }, [selectedRunId, runsQ.data]);

  const activeRun = useMemo(
    () => runsQ.data?.find((r) => r.id === activeRunId) ?? null,
    [runsQ.data, activeRunId],
  );

  const anomaliesQ = useQuery({
    queryKey: ["kroger-validation-anomalies", activeRunId, categoryFilter],
    enabled: !!activeRunId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_kroger_validation_anomalies", {
        _run_id: activeRunId,
        _category: categoryFilter === "all" ? null : categoryFilter,
        _limit: 500,
      });
      if (error) throw error;
      return (data as Anomaly[]) ?? [];
    },
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_run_kroger_validation");
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId) => {
      toast.success("Validation run completed");
      setSelectedRunId(newId);
      queryClient.invalidateQueries({ queryKey: ["kroger-validation-runs"] });
      queryClient.invalidateQueries({ queryKey: ["kroger-validation-anomalies"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Validation failed"),
  });

  return (
    <div className="container mx-auto py-6 px-4 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="w-4 h-4 mr-1" /> Admin
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Kroger Validation</h1>
            <p className="text-sm text-muted-foreground">
              Nightly checks for ZIP→location mappings, outlier medians, and failed refreshes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              runsQ.refetch();
              anomaliesQ.refetch();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Reload
          </Button>
          <Button size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            {runNow.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-1" />
            )}
            Run validation now
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      {activeRun && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            icon={MapPin}
            label="Missing ZIPs"
            value={activeRun.missing_zip_count}
            tone="text-warning"
          />
          <StatTile
            icon={TrendingUp}
            label="Outlier medians"
            value={activeRun.outlier_median_count}
            tone="text-destructive"
          />
          <StatTile
            icon={ServerCrash}
            label="Failed refreshes"
            value={activeRun.failed_refresh_count}
            tone="text-destructive"
          />
          <StatTile
            icon={AlertTriangle}
            label="Total anomalies"
            value={activeRun.total_anomalies}
            tone="text-foreground/70"
          />
        </div>
      )}

      {/* Recent runs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent validation runs</CardTitle>
          <CardDescription>Click a row to inspect that run's anomalies.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsQ.isLoading ? (
            <LoadingState />
          ) : runsQ.data && runsQ.data.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Missing ZIPs</TableHead>
                    <TableHead className="text-right">Outliers</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsQ.data.map((r) => (
                    <TableRow
                      key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      className={cn(
                        "cursor-pointer",
                        r.id === activeRunId && "bg-muted/40",
                      )}
                    >
                      <TableCell>
                        <div className="text-sm">{format(new Date(r.started_at), "PP p")}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.triggered_by ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.missing_zip_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.outlier_median_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.failed_refresh_count}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {r.total_anomalies}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No validation runs yet. Click "Run validation now" to create the first one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anomalies */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Anomalies</CardTitle>
            <CardDescription>
              {activeRun
                ? `Run ${format(new Date(activeRun.started_at), "PP p")}`
                : "Select a run above"}
            </CardDescription>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="missing_zip">Missing ZIP mapping</SelectItem>
              <SelectItem value="outlier_median">Outlier median</SelectItem>
              <SelectItem value="failed_refresh">Failed refresh</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {anomaliesQ.isLoading ? (
            <LoadingState />
          ) : anomaliesQ.data && anomaliesQ.data.length > 0 ? (
            <div className="space-y-2">
              {anomaliesQ.data.map((a) => {
                const meta = CATEGORY_META[a.category] ?? {
                  label: a.category, icon: AlertTriangle, tone: "text-foreground/70",
                };
                const Icon = meta.icon;
                return (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className={cn("mt-0.5 shrink-0", meta.tone)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground">
                          {meta.label}
                        </span>
                        <SeverityBadge severity={a.severity} />
                      </div>
                      <div className="text-sm mt-1 break-words">{a.message}</div>
                      {a.details && Object.keys(a.details).length > 0 && (
                        <details className="mt-1">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            details
                          </summary>
                          <pre className="text-xs mt-1 p-2 rounded bg-muted/40 overflow-x-auto">
                            {JSON.stringify(a.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {activeRun
                ? "No anomalies for this run. Pricing pipeline is healthy. ✨"
                : "No data."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
