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

      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
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
