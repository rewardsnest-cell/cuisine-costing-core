import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, PlayCircle, Save, Info, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

const KV_SCHEDULE = "catering_followups.cron_schedule";
const KV_ENABLED = "catering_followups.enabled";
const DEFAULT_SCHEDULE = "0 14 * * *"; // 14:00 UTC daily

// ---- Server function: trigger dry run (keeps CATERING_CRON_SECRET on server) ----
const runDryRun = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(50).default(10),
      stages: z.array(z.union([z.literal(0), z.literal(5), z.literal(14)])).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const secret = process.env.CATERING_CRON_SECRET;
    if (!secret) {
      return { ok: false, error: "CATERING_CRON_SECRET is not configured on the server." };
    }

    const baseUrl =
      process.env.LOVABLE_PUBLISHED_URL ??
      process.env.VITE_PUBLIC_SITE_URL ??
      "https://project--5912085f-f53d-4d75-a0e6-646a46b82539.lovable.app";

    try {
      const res = await fetch(`${baseUrl}/api/public/hooks/catering-followups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({
          dryRun: true,
          limit: data.limit,
          stages: data.stages,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: json?.error ?? `HTTP ${res.status}`, response: json };
      }
      return { ok: true, response: json };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Network error" };
    }
  });

export const Route = createFileRoute("/admin/catering-cron")({
  head: () => ({
    meta: [
      { title: "Catering Follow-Up Automation — Admin" },
      {
        name: "description",
        content: "Configure schedule and dry-run the catering outreach follow-up cron.",
      },
    ],
  }),
  component: CateringCronPage,
});

type DryRunStage = {
  stage: 0 | 5 | 14;
  processed: number;
  sent: number;
  failed: number;
  preview?: Array<{ id: string; organization_name: string; email: string | null }>;
};

function CateringCronPage() {
  const qc = useQueryClient();
  const [schedule, setSchedule] = useState<string>(DEFAULT_SCHEDULE);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [dryResult, setDryResult] = useState<{
    ran_at?: string;
    results?: DryRunStage[];
    error?: string;
  } | null>(null);

  // Load config from app_kv
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["catering-cron-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_kv")
        .select("key, value, updated_at")
        .in("key", [KV_SCHEDULE, KV_ENABLED]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r] as const));
      return {
        schedule: map.get(KV_SCHEDULE)?.value ?? DEFAULT_SCHEDULE,
        enabled: (map.get(KV_ENABLED)?.value ?? "true") === "true",
        scheduleUpdatedAt: map.get(KV_SCHEDULE)?.updated_at ?? null,
      };
    },
  });

  useEffect(() => {
    if (cfg) {
      setSchedule(cfg.schedule);
      setEnabled(cfg.enabled);
    }
  }, [cfg]);

  const saveCfg = useMutation({
    mutationFn: async () => {
      const trimmed = schedule.trim();
      if (!isValidCron(trimmed)) {
        throw new Error("Invalid cron expression. Expected 5 fields (e.g., '0 14 * * *').");
      }
      const { data: u } = await supabase.auth.getUser();
      const updated_by = u?.user?.id ?? null;
      const rows = [
        { key: KV_SCHEDULE, value: trimmed, updated_by, updated_at: new Date().toISOString() },
        { key: KV_ENABLED, value: enabled ? "true" : "false", updated_by, updated_at: new Date().toISOString() },
      ];
      const { error } = await supabase.from("app_kv").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule saved");
      qc.invalidateQueries({ queryKey: ["catering-cron-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const dryRun = useMutation({
    mutationFn: async () => {
      const r = await runDryRun({ data: { limit: 10 } });
      if (!r.ok) throw new Error(r.error ?? "Dry run failed");
      return r.response as { ran_at: string; results: DryRunStage[] };
    },
    onSuccess: (r) => {
      setDryResult({ ran_at: r.ran_at, results: r.results });
      toast.success("Dry run completed");
    },
    onError: (e: any) => {
      setDryResult({ error: e?.message ?? "Failed" });
      toast.error(e?.message ?? "Dry run failed");
    },
  });

  if (isLoading) return <LoadingState label="Loading cron settings…" />;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Catering Follow-Up Automation</h1>
        <p className="text-muted-foreground mt-1">
          Schedule and test the Day 0 / Day 5 / Day 14 outreach automation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Schedule
          </CardTitle>
          <CardDescription>
            Cron expression in UTC. The pg_cron job uses this value to call{" "}
            <code className="text-xs">/api/public/hooks/catering-followups</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Automation enabled</Label>
              <p className="text-xs text-muted-foreground">
                Disabling pauses the cron-triggered runs without losing settings.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cron">Cron expression (UTC)</Label>
            <Input
              id="cron"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder={DEFAULT_SCHEDULE}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Examples:{" "}
              <code>0 14 * * *</code> (daily 14:00 UTC),{" "}
              <code>0 13 * * 1-5</code> (weekdays 13:00 UTC),{" "}
              <code>0 */6 * * *</code> (every 6 hours).
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              Saving stores the value in <code>app_kv</code>. The actual pg_cron schedule must be
              updated separately (this page does not have permission to alter cron). Use this value
              as the source of truth when re-scheduling.
            </span>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveCfg.mutate()} disabled={saveCfg.isPending}>
              <Save className="h-4 w-4 mr-2" /> Save schedule
            </Button>
            {cfg?.scheduleUpdatedAt && (
              <span className="text-xs text-muted-foreground self-center">
                Last updated {new Date(cfg.scheduleUpdatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" /> Dry run (10 contacts)
          </CardTitle>
          <CardDescription>
            Calls the cron endpoint with <code>dryRun: true</code>, <code>limit: 10</code>. No
            emails are sent and no contact records are mutated — you only see who would be
            contacted at each stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => dryRun.mutate()}
            disabled={dryRun.isPending}
            variant="default"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {dryRun.isPending ? "Running…" : "Run dry-run for 10 contacts"}
          </Button>

          {dryResult?.error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" />
              <div>
                <div className="font-medium text-destructive">Dry run failed</div>
                <div className="text-muted-foreground">{dryResult.error}</div>
              </div>
            </div>
          )}

          {dryResult?.results && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Ran at {dryResult.ran_at ? new Date(dryResult.ran_at).toLocaleString() : "—"}
              </div>
              {dryResult.results.map((s) => (
                <div key={s.stage} className="rounded-md border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Day {s.stage}</div>
                    <Badge variant="secondary">
                      {s.processed} would be contacted
                    </Badge>
                  </div>
                  {s.preview && s.preview.length > 0 ? (
                    <ul className="text-sm space-y-1">
                      {s.preview.map((p) => (
                        <li key={p.id} className="flex justify-between gap-4">
                          <span className="truncate">{p.organization_name}</span>
                          <span className="text-muted-foreground text-xs truncate">
                            {p.email ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No contacts match this stage right now.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  // Permissive validation — accept *, numbers, ranges, lists, steps.
  const re = /^(\*|\d+|\*\/\d+|\d+(-\d+)?(\/\d+)?(,\d+(-\d+)?(\/\d+)?)*)$/;
  return parts.every((p) => re.test(p));
}
