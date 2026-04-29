import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity,
  Tag,
  Upload,
  Ruler,
  History,
  Calculator,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { peOverview } from "@/lib/server-fns/pricing-engine.functions";

export const Route = createFileRoute("/admin/pricing-v3")({
  head: () => ({
    meta: [
      { title: "Pricing v3 Overview — VPS Finest" },
      { name: "description", content: "API status, last CSV import, and recent price changes for the VPS Finest Pricing Engine." },
    ],
  }),
  component: PricingV3Overview,
  errorComponent: ({ error }) => (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Failed to load overview</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error.message}</CardContent>
      </Card>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

type Overview = Awaited<ReturnType<typeof peOverview>>;

function PricingV3Overview() {
  const fn = useServerFn(peOverview);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Pricing v3 Overview</h1>
          <p className="text-muted-foreground mt-1">
            Single source of truth — Grocery Pricing API → ingredient cache → recipe cost.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* API Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" /> API Status
              </CardTitle>
              <CardDescription>Grocery Pricing API health and ingredient coverage.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/pricing-engine">
                Open tab <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Stat label="API Key" value={
              data?.stats.api_key_configured
                ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Configured</Badge>
                : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Missing</Badge>
            } />
            <Stat label="Ingredients" value={data?.stats.total_ingredients ?? "—"} />
            <Stat label="Priced" value={data?.stats.priced ?? "—"} tone="ok" />
            <Stat label="Missing" value={data?.stats.missing ?? "—"} tone={data && data.stats.missing > 0 ? "warn" : undefined} />
            <Stat label="Errored" value={data?.stats.errored ?? "—"} tone={data && data.stats.errored > 0 ? "error" : undefined} />
            <Stat label="Stale (>7d)" value={data?.stats.stale ?? "—"} tone={data && data.stats.stale > 0 ? "warn" : undefined} />
            <Stat label="Avg confidence" value={data ? data.stats.avg_confidence.toFixed(3) : "—"} />
          </div>
        </CardContent>
      </Card>

      {/* Last CSV Import */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" /> Last CSV Import
              </CardTitle>
              <CardDescription>Most recent manual price import batch.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/pricing-engine">
                Open tab <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data?.last_csv_import ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Stat label="Imported at" value={new Date(data.last_csv_import.recorded_at).toLocaleString()} />
              <Stat label="Rows in batch (±2 min)" value={data.last_csv_import.batch_count} />
              <Stat label="Source" value={<Badge variant="secondary">csv_import</Badge>} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No CSV imports yet. Use the <strong>CSV Import</strong> tab on the Pricing Engine page to upload prices.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Price Changes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Recent Price Changes
              </CardTitle>
              <CardDescription>Last 10 entries across all sources.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/pricing-engine">
                Open tab <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data && data.recent_changes.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Price / base unit</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Manual?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent_changes.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.recorded_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{r.ingredient_name}</TableCell>
                      <TableCell className="font-mono">
                        {r.currency ?? "USD"} {Number(r.price_per_base_unit).toFixed(4)} / {r.base_unit || "—"}
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                      <TableCell>
                        {r.is_manual_override ? <Badge variant="secondary">manual</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No price history yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Quick links to each tab */}
      <Card>
        <CardHeader>
          <CardTitle>Jump to a tab</CardTitle>
          <CardDescription>All pricing v3 tools live under <code>/admin/pricing-engine</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLink to="/admin/pricing-engine" icon={Activity} label="API Status" desc="Coverage & confidence" />
            <QuickLink to="/admin/pricing-engine" icon={Tag} label="Ingredients" desc="Canonical names & aliases" />
            <QuickLink to="/admin/pricing-engine" icon={Tag} label="Ingredient Prices" desc="Cache & manual overrides" />
            <QuickLink to="/admin/pricing-engine" icon={Upload} label="CSV Import" desc="Bulk update prices" />
            <QuickLink to="/admin/pricing-engine" icon={Ruler} label="Unit Tester" desc="Verify conversions" />
            <QuickLink to="/admin/pricing-engine" icon={History} label="Price History" desc="Audit trail" />
            <QuickLink to="/admin/pricing-engine" icon={Calculator} label="Recipe Cost Inspector" desc="Cost breakdown" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "error";
}) {
  const toneClass =
    tone === "ok"
      ? "text-green-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "error"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  desc,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
    >
      <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
    </Link>
  );
}
