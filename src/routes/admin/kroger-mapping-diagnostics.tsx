import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/kroger-mapping-diagnostics")({
  head: () => ({
    meta: [
      { title: "Kroger Mapping Diagnostics — Admin" },
      { name: "description", content: "Mapping run status, last processed page/offset, and SKU created vs skipped counts." },
    ],
  }),
  component: MappingDiagnosticsPage,
});

type Run = {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  items_queried: number;
  sku_map_rows_touched: number;
  errors: any;
  message: string | null;
  location_id: string | null;
  created_at: string;
};

type ProgressRow = {
  search_term: string;
  page: number;
  products_seen: number;
  completed_at: string | null;
  created_at: string;
};

function statusBadge(status: string) {
  const map: Record<string, { variant: any; icon: any; cls?: string }> = {
    completed: { variant: "default", icon: CheckCircle2, cls: "bg-success text-success-foreground" },
    running: { variant: "secondary", icon: RefreshCw },
    queued: { variant: "outline", icon: Clock },
    failed: { variant: "destructive", icon: XCircle },
    skipped: { variant: "outline", icon: AlertTriangle },
  };
  const m = map[status] ?? { variant: "outline", icon: AlertTriangle };
  const Icon = m.icon;
  return (
    <Badge variant={m.variant} className={m.cls}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

function MappingDiagnosticsPage() {
  // Latest run
  const runQ = useQuery({
    queryKey: ["mapping-diag-latest-run"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kroger_ingest_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Run | null;
    },
    refetchInterval: 10_000,
  });

  const run = runQ.data;

  // Progress for the latest run (per search_term)
  const progressQ = useQuery({
    queryKey: ["mapping-diag-progress", run?.id],
    enabled: !!run?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kroger_bootstrap_progress")
        .select("search_term, page, products_seen, completed_at, created_at")
        .eq("run_id", run!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProgressRow[];
    },
    refetchInterval: 10_000,
  });

  // Created vs skipped within the latest run window.
  // "created" = sku rows whose created_at is within the run window
  // "skipped" (existing/refreshed) = rows whose created_at is BEFORE the run started
  //                                   but last_seen_at falls within the run window
  const createdSkippedQ = useQuery({
    queryKey: ["mapping-diag-created-skipped", run?.id, run?.started_at, run?.finished_at],
    enabled: !!run?.started_at,
    queryFn: async () => {
      const start = run!.started_at!;
      const end = run!.finished_at ?? new Date().toISOString();

      const [createdRes, touchedRes] = await Promise.all([
        (supabase as any)
          .from("kroger_sku_map")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start)
          .lte("created_at", end),
        (supabase as any)
          .from("kroger_sku_map")
          .select("*", { count: "exact", head: true })
          .gte("last_seen_at", start)
          .lte("last_seen_at", end),
      ]);

      if (createdRes.error) throw createdRes.error;
      if (touchedRes.error) throw touchedRes.error;

      const created = createdRes.count ?? 0;
      const touched = touchedRes.count ?? 0;
      const skipped = Math.max(0, touched - created);
      return { created, skipped, touched };
    },
    refetchInterval: 10_000,
  });

  if (runQ.isLoading) return <LoadingState label="Loading mapping diagnostics…" />;

  const progress = progressQ.data ?? [];
  const totalProductsSeen = progress.reduce((s, p) => s + (p.products_seen || 0), 0);
  const lastProgress = progress.length ? progress[progress.length - 1] : null;
  const completedTerms = progress.filter((p) => p.completed_at).length;
  const cs = createdSkippedQ.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to Admin
          </Link>
          <h2 className="font-display text-2xl font-bold mt-1">Kroger Mapping Diagnostics</h2>
          <p className="text-sm text-muted-foreground">
            Latest mapping run progress, last processed page, and created vs skipped SKU rows.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            runQ.refetch();
            progressQ.refetch();
            createdSkippedQ.refetch();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Latest run */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest Mapping Run</CardTitle>
          <CardDescription>
            {run
              ? `Started ${run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : "—"}`
              : "No runs recorded yet."}
          </CardDescription>
        </CardHeader>
        {run && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1">{statusBadge(run.status)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Items Queried</p>
                <p className="text-lg font-semibold">{run.items_queried}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SKU Rows Touched</p>
                <p className="text-lg font-semibold">{run.sku_map_rows_touched}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm font-mono">{run.location_id ?? "—"}</p>
              </div>
            </div>
            {run.message && (
              <div className="text-sm bg-muted/40 rounded p-3">
                <span className="font-medium">Message:</span> {run.message}
              </div>
            )}
            {Array.isArray(run.errors) && run.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive flex items-center gap-1 mb-2">
                  <AlertTriangle className="w-4 h-4" /> Errors ({run.errors.length})
                </p>
                <pre className="text-xs bg-destructive/10 border border-destructive/20 rounded p-3 overflow-auto max-h-48">
                  {JSON.stringify(run.errors, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Created vs skipped */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Created vs Skipped (this run)</CardTitle>
          <CardDescription>
            Counts derived from <code className="text-xs">kroger_sku_map</code> within the run window.
            Skipped = rows already existing that were re-touched (last_seen_at refreshed) instead of newly inserted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!run?.started_at ? (
            <p className="text-sm text-muted-foreground">Run has not started yet.</p>
          ) : createdSkippedQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Calculating…</p>
          ) : !cs ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <p className="text-xs text-muted-foreground">Created (new)</p>
                <p className="text-2xl font-bold font-display text-success">{cs.created.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <p className="text-xs text-muted-foreground">Skipped (existing, refreshed)</p>
                <p className="text-2xl font-bold font-display text-warning">{cs.skipped.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <p className="text-xs text-muted-foreground">Total Touched</p>
                <p className="text-2xl font-bold font-display">{cs.touched.toLocaleString()}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last processed offset / page */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Last Processed Offset</CardTitle>
          <CardDescription>
            {progress.length
              ? `${completedTerms}/${progress.length} search terms completed · ${totalProductsSeen.toLocaleString()} products seen`
              : "No progress rows for this run."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lastProgress && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Last Search Term</p>
                <p className="text-sm font-mono truncate">{lastProgress.search_term}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Page</p>
                <p className="text-lg font-semibold">{lastProgress.page}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Products Seen (term)</p>
                <p className="text-lg font-semibold">{lastProgress.products_seen}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-sm">
                  {lastProgress.completed_at
                    ? format(new Date(lastProgress.completed_at), "MMM d HH:mm:ss")
                    : <span className="text-warning">in progress</span>}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-term progress table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> Per-Term Progress
          </CardTitle>
          <CardDescription>Pagination state for each search term in this run.</CardDescription>
        </CardHeader>
        <CardContent>
          {progress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No progress yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search Term</TableHead>
                  <TableHead className="text-right">Page</TableHead>
                  <TableHead className="text-right">Products Seen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.map((p) => (
                  <TableRow key={p.search_term}>
                    <TableCell className="font-mono text-xs">{p.search_term}</TableCell>
                    <TableCell className="text-right">{p.page}</TableCell>
                    <TableCell className="text-right">{p.products_seen}</TableCell>
                    <TableCell>
                      {p.completed_at ? (
                        <Badge className="bg-success text-success-foreground">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> done
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <RefreshCw className="w-3 h-3 mr-1" /> running
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.completed_at ? format(new Date(p.completed_at), "MMM d HH:mm:ss") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
