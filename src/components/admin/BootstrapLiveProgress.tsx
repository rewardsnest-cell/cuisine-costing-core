// Live progress panel for the Stage 0 catalog bootstrap.
// Polls bootstrap state every 2.5s while a run is active and surfaces the
// current phase: dry-running → fetching products → normalizing → finalizing.
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  CheckCircle2,
  Circle,
  Loader2,
  ShieldCheck,
  Download,
  Scale,
  Flag,
} from "lucide-react";
import {
  getCatalogBootstrapState,
  listCatalogRuns,
} from "@/lib/server-fns/pricing-v2-catalog.functions";

export type GuardedPhase = "idle" | "dry-running" | "awaiting-confirm" | "full-running";

type PhaseKey = "dry_run" | "fetching" | "normalizing" | "finalizing" | "done";

const PHASE_ORDER: PhaseKey[] = ["dry_run", "fetching", "normalizing", "finalizing", "done"];

const PHASE_META: Record<PhaseKey, { label: string; icon: any; hint: string }> = {
  dry_run: {
    label: "Dry-run preflight",
    icon: ShieldCheck,
    hint: "Validating connection & sample batch — no writes",
  },
  fetching: {
    label: "Fetching products",
    icon: Download,
    hint: "Calling Kroger Products API for mapped UPCs",
  },
  normalizing: {
    label: "Normalizing",
    icon: Scale,
    hint: "Parsing weights & writing catalog rows",
  },
  finalizing: {
    label: "Waiting to finalize",
    icon: Flag,
    hint: "Closing run, updating bootstrap state",
  },
  done: {
    label: "Completed",
    icon: CheckCircle2,
    hint: "Bootstrap completed",
  },
};

export function BootstrapLiveProgress({ guardedPhase }: { guardedPhase: GuardedPhase }) {
  const isLocallyActive =
    guardedPhase === "dry-running" ||
    guardedPhase === "full-running" ||
    guardedPhase === "awaiting-confirm";

  const stateQ = useQuery({
    queryKey: ["pricing-v2", "catalog", "bootstrap-state"],
    queryFn: () => getCatalogBootstrapState(),
    refetchInterval: (q: any) => {
      const status = q.state?.data?.state?.status;
      return isLocallyActive || status === "IN_PROGRESS" ? 2500 : false;
    },
  });

  const runsQ = useQuery({
    queryKey: ["pricing-v2", "catalog", "runs"],
    queryFn: () => listCatalogRuns(),
    refetchInterval: isLocallyActive ? 2500 : false,
  });

  const bs = stateQ.data;
  const status = bs?.state?.status ?? "NOT_STARTED";
  const latestRun = (runsQ.data?.runs ?? [])[0];
  const lastRunIsRunning = latestRun?.status === "running";

  // Derive current phase
  let current: PhaseKey;
  if (guardedPhase === "dry-running") current = "dry_run";
  else if (guardedPhase === "full-running" || lastRunIsRunning) {
    // If counts_in is set but counts_out lags, we're normalizing.
    const cin = (latestRun?.counts_in ?? 0) as number;
    const cout = (latestRun?.counts_out ?? 0) as number;
    if (cin === 0) current = "fetching";
    else if (cout < cin) current = "normalizing";
    else current = "finalizing";
  } else if (guardedPhase === "awaiting-confirm") {
    current = "dry_run";
  } else if (status === "COMPLETED") current = "done";
  else if (status === "IN_PROGRESS") current = "fetching";
  else current = "fetching";

  const isAnyActive = isLocallyActive || lastRunIsRunning || status === "IN_PROGRESS";

  // Inventory progress
  const total = bs?.inventory_ids_total ?? 0;
  const processed = bs?.inventory_ids_processed ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <Card className={isAnyActive ? "border-amber-500/60" : status === "COMPLETED" ? "border-success/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Live Bootstrap Progress
          {isAnyActive ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {PHASE_META[current].label}
            </Badge>
          ) : status === "COMPLETED" ? (
            <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15">
              <CheckCircle2 className="w-3 h-3" /> completed
            </Badge>
          ) : (
            <Badge variant="outline">idle</Badge>
          )}
        </CardTitle>
        <div className="text-[11px] text-muted-foreground">
          {stateQ.dataUpdatedAt ? `updated ${new Date(stateQ.dataUpdatedAt).toLocaleTimeString()}` : ""}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phase timeline */}
        <ol className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {PHASE_ORDER.map((key) => {
            const meta = PHASE_META[key];
            const Icon = meta.icon;
            const idxCurrent = PHASE_ORDER.indexOf(current);
            const idxThis = PHASE_ORDER.indexOf(key);
            const isCurrent = key === current && isAnyActive;
            const isPast =
              status === "COMPLETED"
                ? key !== "done"
                : idxThis < idxCurrent;
            const isFuture = !isCurrent && !isPast && key !== "done";
            const completed = status === "COMPLETED" && key === "done";

            const tone = isCurrent
              ? "border-amber-500/60 bg-amber-500/5"
              : isPast || completed
                ? "border-success/40 bg-success/5"
                : "border-border bg-muted/20 opacity-70";

            return (
              <li
                key={key}
                className={`rounded-md border ${tone} p-2 flex flex-col gap-1`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  ) : isPast || completed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <Icon className="w-3.5 h-3.5" />
                  <span>{meta.label}</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-snug">{meta.hint}</div>
              </li>
            );
          })}
        </ol>

        {/* Inventory progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              inventory IDs processed {processed.toLocaleString()} / {total.toLocaleString()}
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {/* Latest run counts (only meaningful when running) */}
        {latestRun && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Stat label="Total fetched" value={(bs?.state?.total_items_fetched ?? 0).toLocaleString()} />
            <Stat label="Last run in / out" value={`${latestRun.counts_in ?? 0} / ${latestRun.counts_out ?? 0}`} />
            <Stat label="Warnings" value={(latestRun.warnings_count ?? 0).toLocaleString()} />
            <Stat
              label="Errors"
              value={(latestRun.errors_count ?? 0).toLocaleString()}
              tone={(latestRun.errors_count ?? 0) > 0 ? "danger" : "ok"}
            />
          </div>
        )}

        {guardedPhase === "awaiting-confirm" && (
          <p className="text-[11px] text-amber-700 bg-amber-500/10 rounded px-2 py-1.5">
            Dry-run finished — awaiting your confirmation to start the full run.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "danger";
}) {
  const toneClass = tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-muted/30 rounded-md px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}
