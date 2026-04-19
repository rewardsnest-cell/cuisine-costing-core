import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getNationalPricingStatus,
  getNationalPricingPreview,
  upsertStagingRows,
  activateNationalPrices,
} from "@/lib/server-fns/national-pricing-activation.functions";
import { getFeatureFlags } from "@/lib/server-fns/feature-flags.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Globe2, AlertCircle, CheckCircle2, Upload, ShieldCheck, Lock } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";

export const Route = createFileRoute("/admin/pricing/national")({
  head: () => ({
    meta: [
      { title: "National Pricing — Admin" },
      {
        name: "description",
        content:
          "Activate monthly national ingredient benchmarks to protect quote margins.",
      },
    ],
  }),
  component: NationalPricingPage,
});

type Status = Awaited<ReturnType<typeof getNationalPricingStatus>>;
type Preview = Awaited<ReturnType<typeof getNationalPricingPreview>>;

function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ""));
    out.push(row);
  }
  return out;
}

function NationalPricingPage() {
  const statusFn = useServerFn(getNationalPricingStatus);
  const previewFn = useServerFn(getNationalPricingPreview);
  const upsertFn = useServerFn(upsertStagingRows);
  const activateFn = useServerFn(activateNationalPrices);
  const flagsFn = useServerFn(getFeatureFlags);

  const [month, setMonth] = useState(previousMonth());
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [csvText, setCsvText] = useState("");

  async function refresh(targetMonth: string) {
    setLoading(true);
    setError(null);
    try {
      const [s, p, f] = await Promise.all([
        statusFn({ data: { stagedMonth: targetMonth } }),
        previewFn({ data: { month: targetMonth } }),
        flagsFn(),
      ]);
      setStatus(s);
      setPreview(p);
      setFlagEnabled(!!f.national_pricing_enabled);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const parsed = parseCSV(csvText);
      if (!parsed.length) throw new Error("No rows in CSV");
      const rows = parsed.map((r) => ({
        ingredient_id: r.ingredient_id,
        price: Number(r.price),
        unit: r.unit,
        region: r.region || null,
        month: r.month || month,
        source: r.source || "manual",
      }));
      const res = await upsertFn({ data: { rows } });
      setInfo(`Staged ${res.upserted} rows${res.errors.length ? ` (${res.errors.length} errors)` : ""}.`);
      setCsvText("");
      await refresh(month);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await activateFn({ data: { month } });
      setInfo(`Activated ${month}: inserted ${res.inserted}, skipped ${res.skipped}.`);
      await refresh(month);
    } catch (e: any) {
      setError(e?.message || "Activation failed");
    } finally {
      setBusy(false);
    }
  }

  const canActivate = useMemo(
    () =>
      !!status &&
      status.coverage >= (status.threshold ?? 0.85) &&
      !busy &&
      flagEnabled === true,
    [status, busy, flagEnabled],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Globe2 className="w-7 h-7 text-primary" /> National Pricing
        </h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Monthly national benchmarks used to prevent under-quoting when local prices are temporarily low.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert>
          <CheckCircle2 className="w-4 h-4" />
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}
      {flagEnabled === false && (
        <Alert>
          <Lock className="w-4 h-4" />
          <AlertDescription>
            National pricing is currently <strong>disabled</strong>. Activation and the
            quote pricing floor are gated behind the <code>national_pricing_enabled</code>{" "}
            feature flag. Enable it from{" "}
            <a className="underline" href="/admin/margin-volatility">
              Margin &amp; Volatility
            </a>{" "}
            to use this workflow.
          </AlertDescription>
        </Alert>
      )}

      {/* Status header */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !status ? (
            <LoadingState label="Loading status…" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Active Month</div>
                <div className="font-medium tabular-nums">{status.activeMonth || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Staged Month</div>
                <div className="font-medium tabular-nums">{status.stagedMonth || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Coverage</div>
                <div className="font-medium tabular-nums">
                  {status.coveragePct}% ({status.coveredIngredients}/{status.totalIngredients})
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Source</div>
                <div className="font-medium">{status.source || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <Badge variant={status.status === "Ready" ? "default" : "secondary"}>
                  {status.status}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Month selector + activate */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Activate Month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Month (YYYY-MM)</Label>
              <Input
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-36"
                placeholder="2026-03"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => refresh(month)}
              disabled={busy || loading}
            >
              Reload
            </Button>
            <Button onClick={handleActivate} disabled={!canActivate}>
              {busy ? "Working…" : `Activate ${month} National Prices`}
            </Button>
          </div>
          {status && status.coverage < (status.threshold ?? 0.85) && (
            <p className="text-xs text-muted-foreground">
              Activation requires ≥{Math.round((status.threshold ?? 0.85) * 100)}% ingredient
              coverage. Currently {status.coveragePct}%.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upload staging */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Upload className="w-4 h-4" /> Stage Prices (CSV)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Headers: <code>ingredient_id,price,unit,month,source</code> (optional: <code>region</code>).
            Staging rows are overwritable previews and never touch live snapshots.
          </p>
          <Textarea
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"ingredient_id,price,unit,month,source\n<uuid>,3.49,lb,2026-03,USDA"}
            className="font-mono text-xs"
          />
          <Button onClick={handleUpload} disabled={busy || !csvText.trim()}>
            {busy ? "Uploading…" : "Upload to Staging"}
          </Button>
        </CardContent>
      </Card>

      {/* Preview table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Staged Preview — {month}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !preview ? (
            <LoadingState label="Loading preview…" />
          ) : preview.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staged rows for this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Ingredient</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1.5 pr-3">{r.ingredient_name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">${r.price.toFixed(2)}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{r.unit}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview && preview.missing.length > 0 && (
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Missing ingredients ({preview.missing.length})
              </summary>
              <ul className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {preview.missing.map((m) => (
                  <li key={m.id} className="text-muted-foreground">{m.name}</li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
