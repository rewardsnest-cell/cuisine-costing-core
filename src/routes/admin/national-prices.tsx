import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { insertNationalSnapshots } from "@/lib/server-fns/national-snapshots.functions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Globe2, Upload, Plus, AlertCircle, ShieldCheck, Lock, CheckCircle2,
} from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { FredPullPanel } from "@/components/admin/FredPullPanel";
import { FredMappingsManager } from "@/components/admin/FredMappingsManager";
import { FredPullHistory } from "@/components/admin/FredPullHistory";
import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/national-prices")({
  head: () => ({
    meta: [
      { title: "Pricing Intelligence — Admin" },
      { name: "description", content: "Manage FRED sources, monthly snapshots, and the pricing safety floor." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as string) || "overview",
  }),
  component: NationalPricesPage,
});

type Reference = { id: string; canonical_name: string; default_unit: string };
type Snapshot = {
  id: string;
  ingredient_id: string;
  price: number;
  unit: string;
  region: string | null;
  month: string;
  source: string;
  created_at: string;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

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

function NationalPricesPage() {
  const search = useSearch({ from: "/admin/national-prices" });
  const navigate = useNavigate({ from: "/admin/national-prices" });
  const tab = search.tab || "overview";

  const insertFn = useServerFn(insertNationalSnapshots);
  const statusFn = useServerFn(getNationalPricingStatus);
  const previewFn = useServerFn(getNationalPricingPreview);
  const upsertFn = useServerFn(upsertStagingRows);
  const activateFn = useServerFn(activateNationalPrices);
  const flagsFn = useServerFn(getFeatureFlags);

  const [refs, setRefs] = useState<Reference[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Overview / Snapshots state
  const [month, setMonth] = useState(previousMonth());
  const [status, setStatus] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateInfo, setActivateInfo] = useState<string | null>(null);
  const [stagingCsv, setStagingCsv] = useState("");

  // Single entry / manual CSV
  const [form, setForm] = useState({
    ingredient_id: "",
    price: "",
    unit: "",
    region: "",
    month: currentMonth(),
    source: "USDA",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [{ data: refData }, { data: snapData }] = await Promise.all([
      supabase.from("ingredient_reference").select("id, canonical_name, default_unit").order("canonical_name").limit(2000),
      supabase.from("national_price_snapshots").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setRefs((refData as Reference[]) || []);
    setSnapshots((snapData as Snapshot[]) || []);
    setLoading(false);
  }

  async function refreshStatus(targetMonth: string) {
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
      setActivateError(e?.message || "Failed to load status");
    }
  }

  useEffect(() => {
    loadAll();
    refreshStatus(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refMap = useMemo(() => {
    const m = new Map<string, Reference>();
    refs.forEach((r) => m.set(r.id, r));
    return m;
  }, [refs]);

  function setTab(value: string) {
    navigate({ search: { tab: value }, replace: true });
  }

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await insertFn({
        data: {
          rows: [{
            ingredient_id: form.ingredient_id,
            price: Number(form.price),
            unit: form.unit,
            region: form.region || null,
            month: form.month,
            source: form.source,
          }],
        },
      });
      setResult(res);
      if (res.inserted > 0) setForm((f) => ({ ...f, price: "" }));
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to insert snapshot");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCsvSubmit() {
    setError(null);
    setResult(null);
    setBulkBusy(true);
    try {
      const parsed = parseCSV(csvText);
      if (parsed.length === 0) {
        setError("No data rows found. Headers required: ingredient_id,price,unit,month,source[,region]");
        setBulkBusy(false);
        return;
      }
      const rows = parsed.map((r) => ({
        ingredient_id: r.ingredient_id,
        price: Number(r.price),
        unit: r.unit,
        region: r.region || null,
        month: r.month,
        source: r.source,
      }));
      const res = await insertFn({ data: { rows } });
      setResult(res);
      setCsvText("");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Bulk insert failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleStagingUpload() {
    setActivateError(null);
    setActivateInfo(null);
    setActivateBusy(true);
    try {
      const parsed = parseCSV(stagingCsv);
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
      setActivateInfo(`Staged ${res.upserted} rows${res.errors.length ? ` (${res.errors.length} errors)` : ""}.`);
      setStagingCsv("");
      await refreshStatus(month);
    } catch (e: any) {
      setActivateError(e?.message || "Upload failed");
    } finally {
      setActivateBusy(false);
    }
  }

  async function handleActivate() {
    setActivateError(null);
    setActivateInfo(null);
    setActivateBusy(true);
    try {
      const res = await activateFn({ data: { month } });
      setActivateInfo(`Activated ${month}: inserted ${res.inserted}, skipped ${res.skipped}.`);
      await refreshStatus(month);
      await loadAll();
    } catch (e: any) {
      setActivateError(e?.message || "Activation failed");
    } finally {
      setActivateBusy(false);
    }
  }

  const canActivate =
    !!status &&
    status.coverage >= (status.threshold ?? 0.85) &&
    !activateBusy &&
    flagEnabled === true &&
    MONTH_RE.test(month);

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/national-prices" />

      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Globe2 className="w-7 h-7 text-primary" /> Pricing Intelligence
        </h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          FRED data sources, monthly snapshots, and the safety floor — in one place.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fred">FRED Sources</TabsTrigger>
          <TabsTrigger value="snapshots">Monthly Snapshots</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>

        {/* ───────── OVERVIEW ───────── */}
        <TabsContent value="overview" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Status</CardTitle>
            </CardHeader>
            <CardContent>
              {!status ? (
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
                    <div className="text-xs text-muted-foreground">Floor Enabled</div>
                    <Badge variant={flagEnabled ? "default" : "secondary"}>
                      {flagEnabled === null ? "…" : flagEnabled ? "On" : "Off"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <FredPullHistory />
        </TabsContent>

        {/* ───────── FRED SOURCES ───────── */}
        <TabsContent value="fred" className="space-y-6 mt-6">
          <FredMappingsManager references={refs} onChanged={loadAll} />
          <FredPullPanel onApplied={loadAll} />
          <FredPullHistory />
        </TabsContent>

        {/* ───────── MONTHLY SNAPSHOTS (activation) ───────── */}
        <TabsContent value="snapshots" className="space-y-4 mt-6">
          {activateError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{activateError}</AlertDescription>
            </Alert>
          )}
          {activateInfo && (
            <Alert>
              <CheckCircle2 className="w-4 h-4" />
              <AlertDescription>{activateInfo}</AlertDescription>
            </Alert>
          )}
          {flagEnabled === false && (
            <Alert>
              <Lock className="w-4 h-4" />
              <AlertDescription>
                National pricing floor is currently <strong>disabled</strong>. Activations are gated
                behind the <code>national_pricing_enabled</code> flag — enable from{" "}
                <a className="underline" href="/admin/margin-volatility">Margin &amp; Volatility</a>.
              </AlertDescription>
            </Alert>
          )}

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
                <Button variant="outline" onClick={() => refreshStatus(month)} disabled={activateBusy}>
                  Reload
                </Button>
                <Button onClick={handleActivate} disabled={!canActivate}>
                  {activateBusy ? "Working…" : `Activate ${month}`}
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

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Upload className="w-4 h-4" /> Stage Prices (CSV)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Headers: <code>ingredient_id,price,unit,month,source</code> (optional <code>region</code>).
                Staging is overwritable preview — never touches snapshots until you Activate.
              </p>
              <Textarea
                rows={6}
                value={stagingCsv}
                onChange={(e) => setStagingCsv(e.target.value)}
                placeholder={"ingredient_id,price,unit,month,source\n<uuid>,3.49,lb,2026-03,USDA"}
                className="font-mono text-xs"
              />
              <Button onClick={handleStagingUpload} disabled={activateBusy || !stagingCsv.trim()}>
                {activateBusy ? "Uploading…" : "Upload to Staging"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Staged Preview — {month}</CardTitle>
            </CardHeader>
            <CardContent>
              {!preview ? (
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
                      {preview.rows.map((r: any, i: number) => (
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
                    {preview.missing.map((m: any) => (
                      <li key={m.id} className="text-muted-foreground">{m.name}</li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── MANUAL ENTRY ───────── */}
        <TabsContent value="manual" className="space-y-6 mt-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {result && (
            <Alert>
              <AlertDescription>
                Inserted {result.inserted}, skipped {result.skipped} (already exist).
                {result.errors.length > 0 && (
                  <span className="text-destructive"> Errors: {result.errors.length}</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Single Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleSubmit} className="space-y-3">
                  <div>
                    <Label className="text-xs">Ingredient</Label>
                    <Select
                      value={form.ingredient_id}
                      onValueChange={(v) => {
                        const ref = refMap.get(v);
                        setForm((f) => ({ ...f, ingredient_id: v, unit: f.unit || ref?.default_unit || "" }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select ingredient…" /></SelectTrigger>
                      <SelectContent>
                        {refs.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.canonical_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Price (USD)</Label>
                      <Input type="number" step="0.01" min="0" value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Input value={form.unit}
                        onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                        placeholder="lb, kg, each…" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Month (YYYY-MM)</Label>
                      <Input value={form.month}
                        onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                        placeholder="2026-04" required />
                    </div>
                    <div>
                      <Label className="text-xs">Region (optional)</Label>
                      <Input value={form.region}
                        onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                        placeholder="Midwest" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Source</Label>
                    <Input value={form.source}
                      onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                      placeholder="USDA, BLS, manual…" required />
                  </div>
                  <Button type="submit" disabled={submitting || !form.ingredient_id}>
                    {submitting ? "Adding…" : "Add Snapshot"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Bulk CSV (append-only)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Headers: <code>ingredient_id,price,unit,month,source</code> (optional <code>region</code>).
                  Existing snapshots are skipped — never overwritten.
                </p>
                <Textarea
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={"ingredient_id,price,unit,month,source,region\n<uuid>,3.49,lb,2026-04,USDA,National"}
                  className="font-mono text-xs"
                />
                <Button onClick={handleCsvSubmit} disabled={bulkBusy || !csvText.trim()}>
                  {bulkBusy ? "Uploading…" : "Upload CSV"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Recent Snapshots</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingState label="Loading snapshots…" />
              ) : snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No snapshots yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3">Ingredient</th>
                        <th className="py-2 pr-3">Month</th>
                        <th className="py-2 pr-3">Region</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3 text-right">Price</th>
                        <th className="py-2 pr-3">Unit</th>
                        <th className="py-2 pr-3">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.map((s) => (
                        <tr key={s.id} className="border-b border-border/40">
                          <td className="py-1.5 pr-3">{refMap.get(s.ingredient_id)?.canonical_name || s.ingredient_id}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{s.month}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{s.region || "—"}</td>
                          <td className="py-1.5 pr-3">{s.source}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums font-medium">${Number(s.price).toFixed(2)}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{s.unit}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {new Date(s.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
