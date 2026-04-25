import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, RefreshCw, MapPin, Percent, Database } from "lucide-react";
import {
  getPricingStatus,
  updateMarkupMultiplier,
  runPricingIngest,
  resetPricingPipeline,
} from "@/lib/server-fns/pricing-admin.functions";

export const Route = createFileRoute("/admin/pricing")({
  head: () => ({ meta: [{ title: "Pricing — Admin" }] }),
  component: PricingPage,
});

type Status = Awaited<ReturnType<typeof getPricingStatus>>;

function PricingPage() {
  const fetchStatus = useServerFn(getPricingStatus);
  const saveMarkup = useServerFn(updateMarkupMultiplier);
  const runIngest = useServerFn(runPricingIngest);
  const resetPipeline = useServerFn(resetPricingPipeline);

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [markup, setMarkup] = useState("3");
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [running, setRunning] = useState<"" | "bootstrap" | "daily">("");
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const s = await fetchStatus({ data: undefined as any });
      setStatus(s);
      setMarkup(String(s.markup_multiplier));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSaveMarkup() {
    const v = Number(markup);
    if (!Number.isFinite(v)) {
      toast.error("Enter a valid number");
      return;
    }
    setSavingMarkup(true);
    try {
      await saveMarkup({ data: { value: v } });
      toast.success(`Markup saved at ${v}×`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingMarkup(false);
    }
  }

  async function onRun(mode: "catalog_bootstrap" | "daily_update") {
    setRunning(mode === "catalog_bootstrap" ? "bootstrap" : "daily");
    try {
      const res = await runIngest({ data: { mode } });
      if (!res.ran) {
        toast.error(res.message ?? "Run did not start");
      } else {
        toast.success(res.message ?? "Run completed");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setRunning("");
    }
  }

  async function onReset() {
    if (resetText !== "RESET") return;
    setResetting(true);
    try {
      const res = await resetPipeline({ data: { confirm: "RESET" } });
      const summary = Object.entries(res.counts)
        .map(([k, v]) => `${k}: ${v}`)
        .join("  •  ");
      toast.success(`Pipeline reset. ${summary}`);
      setResetText("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Pricing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hard-coded Kroger location, per-pound canonical pricing, editable markup. One page.
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Configuration
          </CardTitle>
          <CardDescription>
            Pricing pulls always use Cincinnati 45202 (Kroger HQ market). This is intentional — one
            consistent source so the pipeline doesn't drift.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Kroger location</div>
              <div className="font-medium">Cincinnati, OH · 45202</div>
            </div>
            <div>
              <div className="text-muted-foreground">API keys</div>
              <div className="font-medium">
                {status?.keys_configured ? (
                  <Badge variant="secondary">Configured</Badge>
                ) : (
                  <Badge variant="destructive">Missing</Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="markup" className="flex items-center gap-2">
              <Percent className="w-4 h-4" /> Markup multiplier (cost × markup = client price)
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="markup"
                type="number"
                step="0.1"
                min="0.5"
                max="10"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className="w-32"
              />
              <span className="text-muted-foreground text-sm">× (default 3.0)</span>
              <Button onClick={onSaveMarkup} disabled={savingMarkup}>
                {savingMarkup ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run pricing pull */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" /> Run pricing pull
          </CardTitle>
          <CardDescription>
            Bootstrap discovers SKUs from Kroger's catalog. Daily Update prices the confirmed/
            high-confidence ones into your inventory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="SKUs in map" value={status?.sku_count} />
            <Stat label="Kroger price rows" value={status?.kroger_price_rows} />
            <Stat
              label="Inventory items"
              value={
                status
                  ? `${status.inventory_with_cost} / ${status.inventory_count}`
                  : "—"
              }
              hint="with cost"
            />
            <Stat
              label="Last run"
              value={status?.last_run?.status ?? "none"}
              hint={
                status?.last_run?.finished_at
                  ? new Date(status.last_run.finished_at).toLocaleString()
                  : status?.last_run?.created_at
                    ? new Date(status.last_run.created_at).toLocaleString()
                    : ""
              }
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => onRun("catalog_bootstrap")}
              disabled={running !== "" || !status?.keys_configured}
              variant="outline"
            >
              {running === "bootstrap" ? "Bootstrapping…" : "Bootstrap catalog"}
            </Button>
            <Button
              onClick={() => onRun("daily_update")}
              disabled={running !== "" || !status?.keys_configured}
            >
              {running === "daily" ? "Refreshing…" : "Refresh prices today"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refresh()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {status?.last_run?.message && (
            <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
              {status.last_run.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reset */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Clean slate / reset
          </CardTitle>
          <CardDescription>
            Wipes every Kroger table (SKU map, ingest runs, validations, Kroger price history) and
            zeros all inventory item costs so prices come only from fresh pulls. This cannot be
            undone. Type <span className="font-mono font-semibold">RESET</span> to enable the
            button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center">
            <Database className="w-4 h-4 text-muted-foreground" />
            <Input
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="Type RESET"
              className="w-48 font-mono"
            />
            <Button
              variant="destructive"
              onClick={onReset}
              disabled={resetText !== "RESET" || resetting}
            >
              {resetting ? "Resetting…" : "Reset pricing pipeline"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string | null | undefined;
  hint?: string;
}) {
  return (
    <div className="bg-muted/40 rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {value === null || value === undefined ? "—" : value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
