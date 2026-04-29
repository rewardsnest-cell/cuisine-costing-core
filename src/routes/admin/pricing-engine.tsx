import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  peListIngredients,
  peUpsertIngredient,
  peDeleteIngredient,
  peListPrices,
  peRefreshPrices,
  peManualOverride,
  peGetPriceHistory,
  peStatus,
  peComputeRecipeCost,
  peImportPricesCsv,
} from "@/lib/server-fns/pricing-engine.functions";
import { ALLOWED_BASE_UNITS } from "@/lib/server/pricing-engine/units";
import { RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle2, Edit3, Upload, Download, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/admin/pricing-engine")({
  head: () => ({ meta: [{ title: "Pricing Engine — VPS Finest" }] }),
  component: PricingEnginePage,
});

function PricingEnginePage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Pricing Engine</h1>
        <p className="text-muted-foreground mt-1">
          Single source of truth for ingredient prices, recipe costs, and cost per person.
          All prices flow through Grocery Pricing API → ingredient‑normalized cache → deterministic math.
        </p>
      </div>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="status">API Status</TabsTrigger>
          <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
          <TabsTrigger value="prices">Ingredient Prices</TabsTrigger>
          <TabsTrigger value="import">CSV Import</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
          <TabsTrigger value="inspector">Recipe Cost Inspector</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4"><StatusPanel /></TabsContent>
        <TabsContent value="ingredients" className="mt-4"><IngredientsPanel /></TabsContent>
        <TabsContent value="prices" className="mt-4"><PricesPanel /></TabsContent>
        <TabsContent value="import" className="mt-4"><CsvImportPanel /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryPanel /></TabsContent>
        <TabsContent value="inspector" className="mt-4"><InspectorPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// -------------------- Status --------------------
function StatusPanel() {
  const getStatus = useServerFn(peStatus);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try { const r = await getStatus(); setStats(r.stats); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <Card><CardContent className="p-6">Loading…</CardContent></Card>;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Ingredients" value={stats.total_ingredients} />
      <StatCard label="Priced" value={stats.priced} tone="good" />
      <StatCard label="Missing Prices" value={stats.missing} tone={stats.missing > 0 ? "warn" : "good"} />
      <StatCard label="Stale (>7d)" value={stats.stale} tone={stats.stale > 0 ? "warn" : "good"} />
      <StatCard label="Errored" value={stats.errored} tone={stats.errored > 0 ? "bad" : "good"} />
      <StatCard label="Manual Overrides" value={stats.manual} />
      <StatCard label="Avg Confidence" value={(stats.avg_confidence * 100).toFixed(0) + "%"} />
      <StatCard
        label="Grocery Pricing API"
        value={stats.api_key_configured ? "Configured" : "Missing key"}
        tone={stats.api_key_configured ? "good" : "bad"}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: any; tone?: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
    </CardContent></Card>
  );
}

// -------------------- Ingredients --------------------
function IngredientsPanel() {
  const list = useServerFn(peListIngredients);
  const upsert = useServerFn(peUpsertIngredient);
  const del = useServerFn(peDeleteIngredient);
  const [data, setData] = useState<{ ingredients: any[]; aliases: any[] }>({ ingredients: [], aliases: [] });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try { setData(await list()); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const aliasesFor = (id: string) =>
    data.aliases.filter((a) => a.ingredient_id === id).map((a) => a.alias);

  const startNew = () => { setEditing({ canonical_name: "", base_unit: "lb", category: "", notes: "", aliases: [] }); setOpen(true); };
  const startEdit = (ing: any) => { setEditing({ ...ing, aliases: aliasesFor(ing.id) }); setOpen(true); };

  const save = async () => {
    try {
      await upsert({ data: {
        id: editing.id,
        canonical_name: editing.canonical_name,
        base_unit: editing.base_unit,
        category: editing.category || null,
        notes: editing.notes || null,
        aliases: (editing.aliases || []).filter((a: string) => a.trim().length > 0),
      }});
      toast.success("Ingredient saved");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this ingredient? Its prices and history will also be deleted.")) return;
    try { await del({ data: { id } }); toast.success("Deleted"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div>
          <CardTitle>Canonical Ingredients</CardTitle>
          <CardDescription>Define one row per real ingredient with its base unit. Aliases map alternate names to the same ingredient.</CardDescription>
        </div>
        <Button onClick={startNew}><Plus className="w-4 h-4 mr-1" />New</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Base Unit</TableHead><TableHead>Category</TableHead>
            <TableHead>Aliases</TableHead><TableHead className="w-24"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.ingredients.map((ing) => (
              <TableRow key={ing.id}>
                <TableCell className="font-medium">{ing.canonical_name}</TableCell>
                <TableCell><Badge variant="outline">{ing.base_unit}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{ing.category ?? "—"}</TableCell>
                <TableCell className="text-xs">{aliasesFor(ing.id).join(", ") || "—"}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(ing)}><Edit3 className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(ing.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {data.ingredients.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No ingredients yet — click <strong>New</strong> to add the first one.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit Ingredient" : "New Ingredient"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Canonical Name</Label>
                <Input value={editing.canonical_name} onChange={(e) => setEditing({ ...editing, canonical_name: e.target.value })} />
              </div>
              <div>
                <Label>Base Unit</Label>
                <Select value={editing.base_unit} onValueChange={(v) => setEditing({ ...editing, base_unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOWED_BASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category (optional)</Label>
                <Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </div>
              <div>
                <Label>Aliases (comma‑separated)</Label>
                <Input
                  value={(editing.aliases ?? []).join(", ")}
                  onChange={(e) => setEditing({ ...editing, aliases: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// -------------------- Prices --------------------
function PricesPanel() {
  const listPrices = useServerFn(peListPrices);
  const refresh = useServerFn(peRefreshPrices);
  const overrideFn = useServerFn(peManualOverride);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<any | null>(null);
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  const load = async () => {
    try { const r = await listPrices(); setRows(r.rows); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const refreshAll = async () => {
    setBusy(true);
    try {
      const r = await refresh({ data: {} });
      toast.success(`Refreshed ${r.processed} ingredients`);
      load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const refreshOne = async (id: string) => {
    setBusy(true);
    try { await refresh({ data: { ingredient_ids: [id] } }); toast.success("Refreshed"); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const submitOverride = async () => {
    const price = Number(overridePrice);
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid price");
    if (overrideNote.trim().length < 3) return toast.error("Audit note required (min 3 chars)");
    try {
      await overrideFn({ data: {
        ingredient_id: overrideTarget.ingredient.id,
        price_per_base_unit: price,
        note: overrideNote,
      }});
      toast.success("Override saved");
      setOverrideTarget(null); setOverridePrice(""); setOverrideNote(""); load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div>
          <CardTitle>Ingredient Prices</CardTitle>
          <CardDescription>Cached per‑base‑unit price from Grocery Pricing API. Refresh pulls live and updates the cache + history.</CardDescription>
        </div>
        <Button onClick={refreshAll} disabled={busy}>
          <RefreshCw className={`w-4 h-4 mr-1 ${busy ? "animate-spin" : ""}`} />Refresh All
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ingredient</TableHead><TableHead>Base Unit</TableHead>
            <TableHead>Price / unit</TableHead><TableHead>Source</TableHead>
            <TableHead>Confidence</TableHead><TableHead>Status</TableHead>
            <TableHead>Updated</TableHead><TableHead className="w-32"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.ingredient.id}>
                <TableCell className="font-medium">{r.ingredient.canonical_name}</TableCell>
                <TableCell><Badge variant="outline">{r.ingredient.base_unit}</Badge></TableCell>
                <TableCell>
                  {r.price?.price_per_base_unit != null
                    ? `$${Number(r.price.price_per_base_unit).toFixed(4)}`
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {r.price?.is_manual_override
                    ? <Badge>manual</Badge>
                    : (r.price?.source ?? "—")}
                </TableCell>
                <TableCell className="text-xs">
                  {r.price?.confidence_score != null ? (Number(r.price.confidence_score) * 100).toFixed(0) + "%" : "—"}
                </TableCell>
                <TableCell>
                  {r.price?.status === "ok" && !r.is_stale && <Badge variant="outline" className="text-emerald-600 border-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />ok</Badge>}
                  {r.is_stale && <Badge variant="outline" className="text-amber-600 border-amber-600">stale</Badge>}
                  {r.price?.status === "price_missing" && <Badge variant="destructive">missing</Badge>}
                  {r.price?.status === "error" && <Badge variant="destructive">error</Badge>}
                  {!r.price && <Badge variant="outline">no data</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.age_days != null ? `${r.age_days.toFixed(1)}d ago` : "—"}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => refreshOne(r.ingredient.id)} disabled={busy}><RefreshCw className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setOverrideTarget(r); setOverridePrice(String(r.price?.price_per_base_unit ?? "")); }}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Add ingredients first.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!overrideTarget} onOpenChange={(o) => !o && setOverrideTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manual Price Override</DialogTitle></DialogHeader>
          {overrideTarget && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {overrideTarget.ingredient.canonical_name} — price per {overrideTarget.ingredient.base_unit}
              </div>
              <div>
                <Label>Price per base unit (USD)</Label>
                <Input type="number" step="0.0001" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} />
              </div>
              <div>
                <Label>Audit note (required)</Label>
                <Textarea rows={3} value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Why is this override necessary?" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOverrideTarget(null)}>Cancel</Button>
            <Button onClick={submitOverride}>Save Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// -------------------- History --------------------
function HistoryPanel() {
  const list = useServerFn(peListIngredients);
  const getHistory = useServerFn(peGetPriceHistory);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { list().then((r) => setIngredients(r.ingredients)).catch((e) => toast.error(e.message)); }, []);
  useEffect(() => {
    if (!selected) return;
    getHistory({ data: { ingredient_id: selected } }).then((r) => setHistory(r.history)).catch((e) => toast.error(e.message));
  }, [selected]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price History</CardTitle>
        <CardDescription>Append‑only timeline of every price change per ingredient.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="max-w-md"><SelectValue placeholder="Select an ingredient" /></SelectTrigger>
          <SelectContent>
            {ingredients.map((i) => <SelectItem key={i.id} value={i.id}>{i.canonical_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Table>
          <TableHeader><TableRow>
            <TableHead>When</TableHead><TableHead>Price</TableHead><TableHead>Source</TableHead>
            <TableHead>Confidence</TableHead><TableHead>Field path</TableHead><TableHead>Note</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="text-xs">{new Date(h.recorded_at).toLocaleString()}</TableCell>
                <TableCell>${Number(h.price_per_base_unit ?? 0).toFixed(4)}</TableCell>
                <TableCell className="text-xs">{h.is_manual_override ? <Badge>manual</Badge> : h.source}</TableCell>
                <TableCell className="text-xs">{h.confidence_score != null ? (Number(h.confidence_score) * 100).toFixed(0) + "%" : "—"}</TableCell>
                <TableCell className="text-xs font-mono">{h.discovered_field_path ?? "—"}</TableCell>
                <TableCell className="text-xs">{h.override_note ?? "—"}</TableCell>
              </TableRow>
            ))}
            {selected && history.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No history yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// -------------------- Recipe Cost Inspector --------------------
type Line = { ingredient_id: string; quantity: number; unit: string };

function InspectorPanel() {
  const list = useServerFn(peListIngredients);
  const compute = useServerFn(peComputeRecipeCost);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [servings, setServings] = useState(4);
  const [lines, setLines] = useState<Line[]>([{ ingredient_id: "", quantity: 1, unit: "lb" }]);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => { list().then((r) => setIngredients(r.ingredients)).catch((e) => toast.error(e.message)); }, []);

  const run = async () => {
    const valid = lines.filter((l) => l.ingredient_id);
    if (valid.length === 0) return toast.error("Add at least one ingredient");
    try {
      const r = await compute({ data: { servings, ingredients: valid }});
      setResult(r);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe Cost Inspector</CardTitle>
        <CardDescription>
          Read‑only ad‑hoc calculator. Flow: <code>quantity × convert(unit → base unit) × price/base unit</code> ⇒ recipe cost ⇒ ÷ servings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div>
            <Label>Servings</Label>
            <Input type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))} className="w-24" />
          </div>
          <Button variant="outline" onClick={() => setLines([...lines, { ingredient_id: "", quantity: 1, unit: "lb" }])}><Plus className="w-4 h-4 mr-1" />Line</Button>
          <Button onClick={run}>Compute</Button>
        </div>

        <Table>
          <TableHeader><TableRow>
            <TableHead>Ingredient</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead className="w-12"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {lines.map((line, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Select value={line.ingredient_id} onValueChange={(v) => { const c = [...lines]; c[idx].ingredient_id = v; setLines(c); }}>
                    <SelectTrigger><SelectValue placeholder="Pick ingredient" /></SelectTrigger>
                    <SelectContent>
                      {ingredients.map((i) => <SelectItem key={i.id} value={i.id}>{i.canonical_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input type="number" step="0.01" value={line.quantity} onChange={(e) => { const c = [...lines]; c[idx].quantity = Number(e.target.value) || 0; setLines(c); }} className="w-24" /></TableCell>
                <TableCell>
                  <Select value={line.unit} onValueChange={(v) => { const c = [...lines]; c[idx].unit = v; setLines(c); }}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALLOWED_BASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {result && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div><div className="text-xs text-muted-foreground">Servings</div><div className="text-xl font-semibold">{result.servings}</div></div>
                <div><div className="text-xs text-muted-foreground">Recipe Cost</div><div className="text-xl font-semibold">{result.recipe_cost != null ? `$${result.recipe_cost.toFixed(2)}` : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Cost / Person</div><div className="text-xl font-semibold">{result.cost_per_person != null ? `$${result.cost_per_person.toFixed(2)}` : "—"}</div></div>
              </div>
              {!result.complete && (
                <div className="flex items-start gap-2 text-amber-600 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <div>Some ingredients are missing prices or have unconvertible units. Totals shown above are blank until resolved.</div>
                </div>
              )}
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Ingredient</TableHead><TableHead>Qty</TableHead><TableHead>→ Base</TableHead>
                  <TableHead>Price/unit</TableHead><TableHead>Line cost</TableHead><TableHead>Notes</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {result.lines.map((l: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{l.canonical_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.quantity} {l.unit}</TableCell>
                      <TableCell className="text-xs">{l.quantity_in_base_unit != null ? `${l.quantity_in_base_unit.toFixed(4)} ${l.base_unit}` : "—"}</TableCell>
                      <TableCell className="text-xs">{l.price_per_base_unit != null ? `$${l.price_per_base_unit.toFixed(4)}` : "—"}</TableCell>
                      <TableCell>{l.line_cost != null ? `$${l.line_cost.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-xs text-destructive">{l.missing_reason ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- CSV Import --------------------
type ParsedCsvRow = {
  ingredient: string;
  price: number;
  unit: string | null;
  note: string | null;
  _line: number;
  _error?: string;
};

function parseCsv(text: string): { rows: ParsedCsvRow[]; headerError?: string } {
  // Minimal CSV parser supporting quoted fields with commas and "" escapes.
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headerError: "Empty file" };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { cur += c; }
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') { inQuotes = true; }
        else { cur += c; }
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  const idx = (name: string) => headers.indexOf(name);
  const iIng = idx("ingredient");
  const iPrice = idx("price");
  const iUnit = idx("unit");
  const iNote = idx("note");
  if (iIng < 0 || iPrice < 0) {
    return { rows: [], headerError: 'Required headers missing. Need at least "ingredient" and "price".' };
  }

  const rows: ParsedCsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitLine(lines[li]);
    const ingredient = (cells[iIng] ?? "").replace(/^"|"$/g, "").trim();
    const priceRaw = (cells[iPrice] ?? "").replace(/[^\d.\-]/g, "");
    const price = parseFloat(priceRaw);
    const unit = iUnit >= 0 ? (cells[iUnit] ?? "").trim() || null : null;
    const note = iNote >= 0 ? (cells[iNote] ?? "").trim() || null : null;

    const row: ParsedCsvRow = { ingredient, price, unit, note, _line: li + 1 };
    if (!ingredient) row._error = "Missing ingredient";
    else if (!Number.isFinite(price) || price <= 0) row._error = "Invalid price";
    rows.push(row);
  }
  return { rows };
}

const SAMPLE_CSV =
  "ingredient,price,unit,note\n" +
  "Chicken Breast,3.49,lb,Costco bulk pricing\n" +
  "Olive Oil,18.99,l,Restaurant Depot 1L bottle\n" +
  "Garlic,0.35,each,\n";

function CsvImportPanel() {
  const importFn = useServerFn(peImportPricesCsv);
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedCsvRow[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [defaultNote, setDefaultNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    handleParse(text);
  };

  const handleParse = (text: string) => {
    const { rows, headerError: err } = parseCsv(text);
    setParsed(rows);
    setHeaderError(err ?? null);
    setResult(null);
  };

  const validRows = parsed.filter((r) => !r._error);
  const invalidRows = parsed.filter((r) => r._error);

  const submit = async (dryRun: boolean) => {
    if (validRows.length === 0) { toast.error("No valid rows to import"); return; }
    setBusy(true);
    try {
      const r = await importFn({ data: {
        rows: validRows.map((row) => ({
          ingredient: row.ingredient,
          price: row.price,
          unit: row.unit,
          note: row.note,
        })),
        default_note: defaultNote.trim() || undefined,
        dry_run: dryRun,
      }});
      setResult(r);
      if (dryRun) toast.success(`Dry run: ${r.summary.ok} rows would import, ${r.summary.not_found} not found, ${r.summary.bad_unit} bad unit`);
      else toast.success(`Imported ${r.summary.applied} prices`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pricing-engine-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Price Import</CardTitle>
        <CardDescription>
          Upload a CSV to bulk-update ingredient prices. Each row is treated as a manual override
          and recorded in the price history + override audit log. Required columns:{" "}
          <code>ingredient</code>, <code>price</code>. Optional: <code>unit</code> (auto-converts
          to base unit), <code>note</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <label className="cursor-pointer">
              <Upload className="w-4 h-4 mr-1" /> Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </label>
          </Button>
          <Button variant="ghost" onClick={downloadSample}>
            <Download className="w-4 h-4 mr-1" /> Download sample
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm">Default note:</Label>
            <Input className="w-64" placeholder="e.g. Aug 2026 Restaurant Depot run"
              value={defaultNote} onChange={(e) => setDefaultNote(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">
            Or paste CSV directly:
          </Label>
          <Textarea rows={6} className="font-mono text-xs" placeholder={SAMPLE_CSV}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); handleParse(e.target.value); }} />
        </div>

        {headerError && (
          <div className="flex items-start gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {headerError}
          </div>
        )}

        {parsed.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline" className="text-emerald-600 border-emerald-600">
                <FileSpreadsheet className="w-3 h-3 mr-1" />
                {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="destructive">{invalidRows.length} invalid</Badge>
              )}
              <div className="flex-1" />
              <Button variant="outline" disabled={busy || validRows.length === 0} onClick={() => submit(true)}>
                Dry run
              </Button>
              <Button disabled={busy || validRows.length === 0} onClick={() => submit(false)}>
                <Upload className="w-4 h-4 mr-1" /> Import {validRows.length} rows
              </Button>
            </div>

            <div className="max-h-64 overflow-auto border rounded">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {parsed.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{r._line}</TableCell>
                      <TableCell className="text-sm">{r.ingredient || "—"}</TableCell>
                      <TableCell className="text-sm">{Number.isFinite(r.price) ? `$${r.price.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-xs">{r.unit ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.note ?? "—"}</TableCell>
                      <TableCell className="text-xs text-destructive">{r._error ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {result && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Total rows</div><div className="font-semibold">{result.summary.total}</div></div>
                <div><div className="text-xs text-muted-foreground">Matched</div><div className="font-semibold text-emerald-600">{result.summary.ok}</div></div>
                <div><div className="text-xs text-muted-foreground">Not found</div><div className="font-semibold text-amber-600">{result.summary.not_found}</div></div>
                <div><div className="text-xs text-muted-foreground">Bad unit</div><div className="font-semibold text-amber-600">{result.summary.bad_unit}</div></div>
                <div><div className="text-xs text-muted-foreground">{result.summary.dry_run ? "Would apply" : "Applied"}</div><div className="font-semibold">{result.summary.applied}</div></div>
              </div>
              <div className="max-h-64 overflow-auto border rounded">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Input</TableHead><TableHead>Matched</TableHead>
                    <TableHead>Price → Base</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {result.results.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          {r.input_ingredient} — ${r.input_price}
                          {r.input_unit ? `/${r.input_unit}` : ""}
                        </TableCell>
                        <TableCell className="text-xs">{r.matched_canonical_name ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.price_per_base_unit != null
                            ? `$${Number(r.price_per_base_unit).toFixed(4)} / ${r.base_unit}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.status === "ok" && <Badge variant="outline" className="text-emerald-600 border-emerald-600">ok</Badge>}
                          {r.status === "not_found" && <Badge variant="destructive">not found</Badge>}
                          {r.status === "bad_unit" && <Badge variant="destructive">bad unit</Badge>}
                          {r.status === "ambiguous" && <Badge variant="destructive">ambiguous</Badge>}
                          {r.status === "error" && <Badge variant="destructive">error</Badge>}
                          {r.message && <span className="ml-2 text-muted-foreground">{r.message}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
