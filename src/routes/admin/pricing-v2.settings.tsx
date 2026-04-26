import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getPricingV2Settings,
  savePricingV2Settings,
  getPricingV2LastScheduledRun,
} from "@/lib/server-fns/pricing-v2.functions";

export const Route = createFileRoute("/admin/pricing-v2/settings")({
  head: () => ({ meta: [{ title: "Pricing v2 — Settings" }] }),
  component: PricingV2SettingsPage,
});

type Form = {
  kroger_store_id: string;
  kroger_zip: string;
  monthly_schedule_day: number;
  monthly_schedule_hour: number;
  warning_threshold_pct: number;
  zero_cost_blocking: boolean;
  default_menu_multiplier: number;
  stage456_cron_enabled: boolean;
  auto_apply_threshold_pct: number;
};

function PricingV2SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["pricing-v2", "settings"],
    queryFn: () => getPricingV2Settings(),
  });

  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (settings.data?.settings && !form) {
      const s = settings.data.settings;
      setForm({
        kroger_store_id: s.kroger_store_id,
        kroger_zip: s.kroger_zip,
        monthly_schedule_day: s.monthly_schedule_day,
        monthly_schedule_hour: s.monthly_schedule_hour,
        warning_threshold_pct: Number(s.warning_threshold_pct),
        zero_cost_blocking: s.zero_cost_blocking,
        default_menu_multiplier: Number(s.default_menu_multiplier),
        stage456_cron_enabled: s.stage456_cron_enabled ?? true,
        auto_apply_threshold_pct: Number(s.auto_apply_threshold_pct ?? 10),
      });
    }
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (data: Form) => savePricingV2Settings({ data }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  if (!form) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const set = <K extends keyof Form>(key: K, val: Form[K]) =>
    setForm((f) => (f ? { ...f, [key]: val } : f));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Pricing v2 — Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuration for the new pricing pipeline.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Kroger location</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Store ID">
            <Input
              value={form.kroger_store_id}
              onChange={(e) => set("kroger_store_id", e.target.value)}
            />
          </Field>
          <Field label="ZIP code">
            <Input
              value={form.kroger_zip}
              onChange={(e) => set("kroger_zip", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Monthly schedule</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Day of month (1–28)">
            <Input
              type="number" min={1} max={28}
              value={form.monthly_schedule_day}
              onChange={(e) => set("monthly_schedule_day", Number(e.target.value))}
            />
          </Field>
          <Field label="Hour (0–23, UTC)">
            <Input
              type="number" min={0} max={23}
              value={form.monthly_schedule_hour}
              onChange={(e) => set("monthly_schedule_hour", Number(e.target.value))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Thresholds</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Warning threshold (% cost change)">
            <Input
              type="number" step="0.5" min={0} max={100}
              value={form.warning_threshold_pct}
              onChange={(e) => set("warning_threshold_pct", Number(e.target.value))}
            />
          </Field>
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <div className="font-medium text-sm">Zero-cost blocking</div>
              <div className="text-xs text-muted-foreground">
                Block recipes whose ingredient cost is $0.
              </div>
            </div>
            <Switch
              checked={form.zero_cost_blocking}
              onCheckedChange={(v) => set("zero_cost_blocking", v)}
            />
          </div>
          <Field label="Default menu multiplier">
            <Input
              type="number" step="0.1" min={0.1} max={20}
              value={form.default_menu_multiplier}
              onChange={(e) => set("default_menu_multiplier", Number(e.target.value))}
            />
          </Field>
        </CardContent>
      </Card>

      <Stage456AutomationCard
        cronEnabled={form.stage456_cron_enabled}
        threshold={form.auto_apply_threshold_pct}
        onCronChange={(v) => set("stage456_cron_enabled", v)}
        onThresholdChange={(v) => set("auto_apply_threshold_pct", v)}
      />

      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

// ----- Stage 4→6 automation card -------------------------------------------

function Stage456AutomationCard({
  cronEnabled,
  threshold,
  onCronChange,
  onThresholdChange,
}: {
  cronEnabled: boolean;
  threshold: number;
  onCronChange: (v: boolean) => void;
  onThresholdChange: (v: number) => void;
}) {
  const qc = useQueryClient();
  const lastRun = useQuery({
    queryKey: ["pricing-v2", "last-scheduled-run"],
    queryFn: () => getPricingV2LastScheduledRun(),
    refetchInterval: 30_000,
  });
  const latest = lastRun.data?.latest ?? null;
  const recent = lastRun.data?.recent ?? [];

  const statusBadge = (status: string | null | undefined) => {
    if (status === "success")
      return (
        <Badge className="gap-1 bg-green-500/15 text-green-700 hover:bg-green-500/15 border-green-500/30">
          <CheckCircle2 className="w-3 h-3" /> success
        </Badge>
      );
    if (status === "running")
      return (
        <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15 border-primary/30">
          <Loader2 className="w-3 h-3 animate-spin" /> running
        </Badge>
      );
    if (status === "warning")
      return (
        <Badge className="gap-1 bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/15 border-yellow-500/30">
          <AlertTriangle className="w-3 h-3" /> warning
        </Badge>
      );
    if (status === "error" || status === "failed")
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" /> {status}
        </Badge>
      );
    return <Badge variant="secondary">{status ?? "—"}</Badge>;
  };

  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString() : "—";

  const duration = (a: string | null | undefined, b: string | null | undefined) => {
    if (!a || !b) return null;
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (ms < 0 || !Number.isFinite(ms)) return null;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>Stage 4–6 automation</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1 text-xs"
            onClick={() =>
              qc.invalidateQueries({ queryKey: ["pricing-v2", "last-scheduled-run"] })
            }
            disabled={lastRun.isFetching}
            title="Refresh last run"
          >
            <RefreshCw className={`w-3 h-3 ${lastRun.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cron toggle */}
        <div className="flex items-center justify-between border rounded-md p-3">
          <div>
            <div className="font-medium text-sm">Scheduled pipeline (cron)</div>
            <div className="text-xs text-muted-foreground">
              When off, the hourly Stage 4→5→6 cron is skipped. Use to pause automation
              during data cleanup or migrations. Manual runs still work.
            </div>
          </div>
          <Switch
            checked={cronEnabled}
            onCheckedChange={onCronChange}
            aria-label="Toggle Stage 4-6 cron"
          />
        </div>

        {/* Auto-apply threshold */}
        <Field label="Auto-apply threshold (% cost change)">
          <Input
            type="number"
            step="0.5"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground">
            Signal-sourced cost updates below this % are auto-applied. Anything at or above
            this threshold is queued for admin review.
          </p>
        </Field>

        {/* Last scheduled run */}
        <div className="border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium">Last scheduled run</div>
            {lastRun.isLoading ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> loading
              </Badge>
            ) : (
              statusBadge(latest?.status)
            )}
          </div>

          {latest ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Meta label="Stage">{latest.stage}</Meta>
                <Meta label="Started">{fmt(latest.started_at)}</Meta>
                <Meta label="Ended">{fmt(latest.ended_at)}</Meta>
                <Meta label="Duration">{duration(latest.started_at, latest.ended_at) ?? "—"}</Meta>
                <Meta label="Counts in / out">
                  {latest.counts_in} → {latest.counts_out}
                </Meta>
                <Meta label="Warnings / errors">
                  <span className={latest.warnings_count ? "text-yellow-700" : ""}>
                    {latest.warnings_count}
                  </span>{" "}
                  /{" "}
                  <span className={latest.errors_count ? "text-destructive" : ""}>
                    {latest.errors_count}
                  </span>
                </Meta>
                <Meta label="Run ID">
                  <span className="font-mono text-[11px] break-all">{latest.run_id}</span>
                </Meta>
                <Meta label="Notes">
                  <span className="text-muted-foreground">{latest.notes ?? "—"}</span>
                </Meta>
              </div>
              {latest.last_error && (
                <pre className="text-[11px] rounded border bg-destructive/5 border-destructive/20 p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {latest.last_error}
                </pre>
              )}

              {recent.length > 1 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Previous {recent.length - 1} scheduled run{recent.length - 1 === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {recent.slice(1).map((r) => (
                      <li key={r.run_id} className="flex items-center justify-between gap-2 border-t pt-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {statusBadge(r.status)}
                          <span className="truncate">{r.stage}</span>
                        </div>
                        <span className="text-muted-foreground text-[11px]">
                          {fmt(r.started_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No scheduled run recorded yet. The cron writes runs with notes like
              "Stage X — scheduled".
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
