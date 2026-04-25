import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/kroger-ingest-runs")({
  head: () => ({
    meta: [
      { title: "Kroger Ingest Runs — Admin" },
      { name: "description", content: "Latest Kroger catalog bootstrap run status, errors, and SKU review-state counts." },
    ],
  }),
  component: KrogerIngestRunsPage,
});

type IngestRun = {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  items_queried: number;
  price_rows_written: number;
  sku_map_rows_touched: number;
  errors: any;
  message: string | null;
  location_id: string | null;
  item_limit: number | null;
  created_at: string;
};

type StateCount = { review_state: string; count: number };

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; cls?: string }> = {
    completed: { variant: "default", icon: CheckCircle2, cls: "bg-success text-success-foreground" },
    running: { variant: "secondary", icon: RefreshCw },
    queued: { variant: "outline", icon: Clock },
    failed: { variant: "destructive", icon: XCircle },
    skipped: { variant: "outline", icon: AlertTriangle },
  };
  const m = map[status] ?? { variant: "outline" as const, icon: AlertTriangle };
  const Icon = m.icon;
  return (
    <Badge variant={m.variant} className={m.cls}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

function fmtDuration(start: string | null, end: string | null) {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = Math.max(0, e - s);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function KrogerIngestRunsPage() {
  const runsQ = useQuery({
    queryKey: ["kroger-ingest-runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kroger_ingest_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as IngestRun[];
    },
    refetchInterval: 10_000,
  });

  const stateCountsQ = useQuery({
    queryKey: ["kroger-sku-state-counts"],
    queryFn: async () => {
      // Fetch up to 5000 rows; group client-side.
      const { data, error } = await (supabase as any)
        .from("kroger_sku_map")
        .select("review_state")
        .limit(5000);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        const k = (r.review_state ?? "unknown") as string;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([review_state, count]) => ({ review_state, count }))
        .sort((a, b) => b.count - a.count) as StateCount[];
    },
    refetchInterval: 30_000,
  });

  if (runsQ.isLoading) return <LoadingState label="Loading ingest runs…" />;

  const runs = runsQ.data ?? [];
  const latest = runs[0];
  const stateCounts = stateCountsQ.data ?? [];
  const totalSkus = stateCounts.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to Admin
          </Link>
          <h2 className="font-display text-2xl font-bold mt-1">Kroger Ingest Runs</h2>
          <p className="text-sm text-muted-foreground">Bootstrap status, errors, and SKU review-state distribution.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { runsQ.refetch(); stateCountsQ.refetch(); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Latest run summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest Run</CardTitle>
          <CardDescription>
            {latest
              ? `Started ${latest.started_at ? formatDistanceToNow(new Date(latest.started_at), { addSuffix: true }) : "—"}`
              : "No runs recorded yet."}
          </CardDescription>
        </CardHeader>
        {latest && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1">{statusBadge(latest.status)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Items Queried</p>
                <p className="text-lg font-semibold">{latest.items_queried}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SKU Rows Touched</p>
                <p className="text-lg font-semibold">{latest.sku_map_rows_touched}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price Rows Written</p>
                <p className="text-lg font-semibold">{latest.price_rows_written}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-lg font-semibold">{fmtDuration(latest.started_at, latest.finished_at)}</p>
              </div>
            </div>
            {latest.message && (
              <div className="text-sm bg-muted/40 rounded p-3">
                <span className="font-medium">Message:</span> {latest.message}
              </div>
            )}
            {latest.location_id && (
              <p className="text-xs text-muted-foreground">
                Location: <span className="font-mono">{latest.location_id}</span>
                {latest.item_limit ? ` · Item limit: ${latest.item_limit}` : ""}
              </p>
            )}
            {Array.isArray(latest.errors) && latest.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive flex items-center gap-1 mb-2">
                  <AlertTriangle className="w-4 h-4" /> Errors ({latest.errors.length})
                </p>
                <pre className="text-xs bg-destructive/10 border border-destructive/20 rounded p-3 overflow-auto max-h-64">
                  {JSON.stringify(latest.errors, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* SKU review_state counts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SKU Review State Counts</CardTitle>
          <CardDescription>
            {stateCountsQ.isLoading ? "Loading…" : `${totalSkus.toLocaleString()} SKU rows across all states.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stateCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SKU map rows yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {stateCounts.map((s) => (
                <div key={s.review_state} className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="text-xs text-muted-foreground capitalize">{s.review_state}</p>
                  <p className="text-2xl font-bold font-display">{s.count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Runs</CardTitle>
          <CardDescription>Last {runs.length} ingest runs.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">SKUs</TableHead>
                  <TableHead className="text-right">Prices</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const errCount = Array.isArray(r.errors) ? r.errors.length : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {r.started_at ? format(new Date(r.started_at), "MMM d, HH:mm:ss") : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">{r.items_queried}</TableCell>
                      <TableCell className="text-right">{r.sku_map_rows_touched}</TableCell>
                      <TableCell className="text-right">{r.price_rows_written}</TableCell>
                      <TableCell className="text-right text-xs">{fmtDuration(r.started_at, r.finished_at)}</TableCell>
                      <TableCell className="text-right">
                        {errCount > 0 ? (
                          <Badge variant="destructive">{errCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
