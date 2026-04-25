import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, CalendarClock, AlertTriangle, ChefHat, Receipt, Scale, CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import {
  getPricingV2Overview,
  getPricingV2Health,
  runPricingV2SelfTest,
} from "@/lib/server-fns/pricing-v2.functions";
import { getRecipeNormalizationGate } from "@/lib/server-fns/pricing-v2-recipe-normalize.functions";

export const Route = createFileRoute("/admin/pricing-v2/")({
  head: () => ({ meta: [{ title: "Pricing v2 — Control Center" }] }),
  component: PricingV2ControlCenter,
});

function statusVariant(status?: string | null) {
  switch (status) {
    case "success": return "default" as const;
    case "running":
    case "queued": return "secondary" as const;
    case "partial": return "outline" as const;
    case "failed":
    case "skipped": return "destructive" as const;
    default: return "outline" as const;
  }
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function PricingV2ControlCenter() {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["pricing-v2", "overview"],
    queryFn: () => getPricingV2Overview(),
  });
  const health = useQuery({
    queryKey: ["pricing-v2", "health"],
    queryFn: () => getPricingV2Health(),
  });
  const gate = useQuery({
    queryKey: ["pricing-v2", "norm", "gate"],
    queryFn: () => getRecipeNormalizationGate(),
  });
  const selfTest = useMutation({
    mutationFn: () => runPricingV2SelfTest(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-v2", "overview"] });
    },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Pricing v2 — Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Single dashboard for the new pricing pipeline. Modules will be
            added stage-by-stage.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => selfTest.mutate()}
            disabled={selfTest.isPending}
          >
            <FlaskConical className="w-4 h-4" />
            {selfTest.isPending ? "Running…" : "Run Self Test"}
          </Button>
          <Button disabled className="gap-2">
            <CalendarClock className="w-4 h-4" />
            Run Monthly Pipeline
          </Button>
        </div>
      </div>

      {/* Self-test result */}
      {(selfTest.data || selfTest.error) && (
        <SelfTestResult
          data={selfTest.data}
          error={selfTest.error as Error | null}
        />
      )}

      {/* Health tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthTile
          label="Missing weights"
          value={health.data?.tiles.missing_weights}
          icon={Scale}
          to="/admin/inventory"
        />
        <HealthTile
          label="Pending approvals (>10% / 0 cost)"
          value={health.data?.tiles.pending_approvals}
          icon={AlertTriangle}
          to="/admin/inventory"
        />
        <HealthTile
          label="Blocked recipes"
          value={health.data?.tiles.blocked_recipes}
          icon={ChefHat}
          to="/admin/recipe-hub"
        />
        <HealthTile
          label="Unmatched receipt lines"
          value={health.data?.tiles.unmatched_receipts}
          icon={Receipt}
          to="/admin/receipts"
        />
      </div>

      {/* Stages */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline stages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {overview.data?.stages.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-muted-foreground">
                  Last run: {fmtTime(s.last?.started_at)}
                  {s.last && (
                    <>
                      {" • "}
                      in {s.last.counts_in ?? 0} → out {s.last.counts_out ?? 0}
                      {" • "}
                      {s.last.warnings_count ?? 0} warn / {s.last.errors_count ?? 0} err
                    </>
                  )}
                </div>
              </div>
              <Badge variant={statusVariant(s.last?.status)}>
                {s.last?.status ?? "never run"}
              </Badge>
              <Button size="sm" variant="outline" disabled className="gap-1.5">
                <Play className="w-3.5 h-3.5" /> Run Stage
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function HealthTile({
  label, value, icon: Icon, to,
}: {
  label: string;
  value: number | undefined;
  icon: any;
  to: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="hover:border-primary/40 transition-colors h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-foreground">
            {value ?? "—"}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

type SelfTestData = {
  pass: boolean;
  runId: string | null;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
  sampleErrors: any[];
};

function SelfTestResult({ data, error }: { data?: SelfTestData; error: Error | null }) {
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-4 flex items-center gap-3">
          <XCircle className="w-6 h-6 text-destructive" />
          <div>
            <div className="font-display font-bold text-destructive">Self test FAILED</div>
            <div className="text-sm text-muted-foreground">{error.message}</div>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;
  return (
    <Card className={data.pass ? "border-success/50" : "border-destructive/50"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {data.pass ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : (
            <XCircle className="w-5 h-5 text-destructive" />
          )}
          Self test {data.pass ? "PASS" : "FAIL"}
          {data.runId && (
            <Badge variant="outline" className="ml-auto font-mono text-[10px]">
              run_id: {data.runId}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          {data.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {s.ok ? (
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-medium">{s.name}</div>
                {s.detail && (
                  <div className="text-xs text-muted-foreground font-mono">{s.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        {data.sampleErrors.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Sample errors inserted (visible on /admin/pricing-v2/errors)
            </div>
            <div className="space-y-1.5">
              {data.sampleErrors.map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
                  <Badge variant={e.severity === "warning" ? "outline" : "destructive"}>
                    {e.severity}
                  </Badge>
                  <span className="font-mono text-xs">{e.type}</span>
                  <span className="text-muted-foreground text-xs truncate">{e.message}</span>
                </div>
              ))}
            </div>
            <Link
              to="/admin/pricing-v2/errors"
              className="inline-block mt-2 text-xs text-primary underline"
            >
              View in Errors →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
