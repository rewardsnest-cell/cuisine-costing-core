import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { insertNationalSnapshots } from "@/lib/server-fns/national-snapshots.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Globe2, Upload, Plus, AlertCircle } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";

export const Route = createFileRoute("/admin/national-prices")({
  head: () => ({
    meta: [
      { title: "National Ingredient Prices — Admin" },
      { name: "description", content: "Manually update monthly national ingredient price snapshots." },
    ],
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

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
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
  const insertFn = useServerFn(insertNationalSnapshots);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Single entry form
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

  // Bulk CSV
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

  useEffect(() => {
    loadAll();
  }, []);

  const refMap = useMemo(() => {
    const m = new Map<string, Reference>();
    refs.forEach((r) => m.set(r.id, r));
    return m;
  }, [refs]);

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await insertFn({
        data: {
          rows: [
            {
              ingredient_id: form.ingredient_id,
              price: Number(form.price),
              unit: form.unit,
              region: form.region || null,
              month: form.month,
              source: form.source,
            },
          ],
        },
      });
      setResult(res);
      if (res.inserted > 0) {
        setForm((f) => ({ ...f, price: "" }));
      }
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
        setError("No data rows found in CSV. Headers required: ingredient_id,price,unit,month,source[,region]");
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Globe2 className="w-7 h-7 text-primary" />
            National Ingredient Prices
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Append-only monthly snapshots used as a margin floor in quote pricing. Manual updates only — no automatic backfills, no AI.
          </p>
        </div>
      </div>

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
              <Plus className="w-4 h-4" /> Update National Ingredient Prices (Monthly)
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient…" />
                  </SelectTrigger>
                  <SelectContent>
                    {refs.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.canonical_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Price (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="lb, kg, each…"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Month (YYYY-MM)</Label>
                  <Input
                    value={form.month}
                    onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                    placeholder="2026-04"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Region (optional)</Label>
                  <Input
                    value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder="Midwest"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Source</Label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="USDA, BLS, manual…"
                  required
                />
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
              <Upload className="w-4 h-4" /> Bulk CSV Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Headers required: <code>ingredient_id,price,unit,month,source</code> (optional: <code>region</code>).
              Existing snapshots for the same (ingredient, region, month, source) are skipped — never overwritten.
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
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium">
                        ${Number(s.price).toFixed(2)}
                      </td>
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
    </div>
  );
}
