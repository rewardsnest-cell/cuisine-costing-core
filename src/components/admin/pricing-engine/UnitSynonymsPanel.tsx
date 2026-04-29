import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Save } from "lucide-react";
import {
  peListUnitSynonyms,
  peUpsertUnitSynonym,
  peDeleteUnitSynonym,
} from "@/lib/server-fns/unit-synonyms.functions";
import { registerUnitSynonyms, convertQty, normalizeUnit } from "@/lib/server/pricing-engine/units";

type Row = {
  id: string;
  synonym: string;
  canonical: string;
  dimension: "weight" | "volume" | "count";
  factor: number;
  notes: string | null;
};

const DIM_OPTIONS = [
  { value: "weight", label: "Weight (base = lb)" },
  { value: "volume", label: "Volume (base = fl oz)" },
  { value: "count", label: "Count (base = each)" },
] as const;

const SUGGESTED: Array<Pick<Row, "synonym" | "canonical" | "dimension" | "factor"> & { notes: string }> = [
  { synonym: "cups", canonical: "cup", dimension: "volume", factor: 8, notes: "1 cup = 8 fl oz" },
  { synonym: "Tbsp", canonical: "tbsp", dimension: "volume", factor: 0.5, notes: "Capitalized variant" },
  { synonym: "stick", canonical: "stick", dimension: "weight", factor: 0.25, notes: "1 stick butter = 1/4 lb" },
  { synonym: "pinch", canonical: "pinch", dimension: "volume", factor: 1 / 96, notes: "≈ 1/16 tsp" },
  { synonym: "dash", canonical: "dash", dimension: "volume", factor: 1 / 48, notes: "≈ 1/8 tsp" },
];

export function UnitSynonymsPanel() {
  const list = useServerFn(peListUnitSynonyms);
  const upsert = useServerFn(peUpsertUnitSynonym);
  const remove = useServerFn(peDeleteUnitSynonym);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    synonym: "",
    canonical: "",
    dimension: "volume" as Row["dimension"],
    factor: "1",
    notes: "",
  });
  const [test, setTest] = useState({ qty: "1", from: "cups", to: "fl oz" });

  const reload = async () => {
    setLoading(true);
    try {
      const res = await list();
      const list2 = (res.rows ?? []) as Row[];
      setRows(list2);
      registerUnitSynonyms(list2);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load synonyms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const testResult = useMemo(() => {
    const q = Number(test.qty);
    if (!Number.isFinite(q)) return { value: null as number | null, error: "qty must be a number" };
    const v = convertQty(q, test.from, test.to);
    if (v === null) return { value: null, error: "Incompatible units" };
    return { value: v, error: undefined as string | undefined };
  }, [test, rows]);

  async function addRow(payload: typeof draft) {
    const factor = Number(payload.factor);
    if (!payload.synonym.trim() || !payload.canonical.trim() || !Number.isFinite(factor) || factor <= 0) {
      toast.error("Synonym, canonical, and a positive factor are required");
      return;
    }
    setSaving("__new");
    try {
      await upsert({
        data: {
          synonym: payload.synonym.trim(),
          canonical: payload.canonical.trim(),
          dimension: payload.dimension,
          factor,
          notes: payload.notes?.trim() || null,
        },
      });
      toast.success(`Added "${payload.synonym}"`);
      setDraft({ synonym: "", canonical: "", dimension: "volume", factor: "1", notes: "" });
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function saveRow(r: Row) {
    setSaving(r.id);
    try {
      await upsert({
        data: {
          id: r.id,
          synonym: r.synonym,
          canonical: r.canonical,
          dimension: r.dimension,
          factor: Number(r.factor),
          notes: r.notes ?? null,
        },
      });
      toast.success("Saved");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function deleteRow(id: string, syn: string) {
    if (!confirm(`Delete synonym "${syn}"?`)) return;
    setSaving(id);
    try {
      await remove({ data: { id } });
      toast.success("Deleted");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setSaving(null);
    }
  }

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Unit Synonyms Dictionary</CardTitle>
          <CardDescription>
            Custom unit aliases used by <code className="mx-1 rounded bg-muted px-1 text-xs">convertQty</code>,
            the auto-convert tool, and the CSV importer. Factor is expressed in the dimension's base unit
            (weight → lb, volume → fl oz, count → each). Example: <code>cups → cup</code>, dimension volume,
            factor 8 (since 1 cup = 8 fl oz).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Synonym</Label>
              <Input
                className="w-36"
                value={draft.synonym}
                onChange={(e) => setDraft({ ...draft, synonym: e.target.value })}
                placeholder="cups"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Canonical</Label>
              <Input
                className="w-36"
                value={draft.canonical}
                onChange={(e) => setDraft({ ...draft, canonical: e.target.value })}
                placeholder="cup"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dimension</Label>
              <Select
                value={draft.dimension}
                onValueChange={(v) => setDraft({ ...draft, dimension: v as Row["dimension"] })}
              >
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIM_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Factor → base</Label>
              <Input
                className="w-28"
                inputMode="decimal"
                value={draft.factor}
                onChange={(e) => setDraft({ ...draft, factor: e.target.value })}
                placeholder="8"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="1 cup = 8 fl oz"
              />
            </div>
            <Button onClick={() => addRow(draft)} disabled={saving === "__new"}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
            <Button variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Reload
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Quick add:</span>
            {SUGGESTED.map((s) => {
              const exists = rows.some((r) => normalizeUnit(r.synonym) === normalizeUnit(s.synonym));
              return (
                <Button
                  key={s.synonym}
                  size="sm"
                  variant="secondary"
                  disabled={exists || saving === "__new"}
                  onClick={() =>
                    addRow({
                      synonym: s.synonym,
                      canonical: s.canonical,
                      dimension: s.dimension,
                      factor: String(s.factor),
                      notes: s.notes,
                    })
                  }
                >
                  {s.synonym} → {s.canonical}
                </Button>
              );
            })}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Synonym</TableHead>
                  <TableHead>Canonical</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead className="w-32">Factor → base</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No custom synonyms yet. Add one above or use a quick-add chip.
                  </TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Input value={r.synonym} onChange={(e) => updateRow(r.id, { synonym: e.target.value })} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Input value={r.canonical} onChange={(e) => updateRow(r.id, { canonical: e.target.value })} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Select value={r.dimension} onValueChange={(v) => updateRow(r.id, { dimension: v as Row["dimension"] })}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DIM_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono"
                        inputMode="decimal"
                        value={String(r.factor)}
                        onChange={(e) => updateRow(r.id, { factor: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={r.notes ?? ""}
                        onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => saveRow(r)} disabled={saving === r.id}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteRow(r.id, r.synonym)} disabled={saving === r.id}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test a conversion</CardTitle>
          <CardDescription>
            Uses the live registry — including the synonyms above — to verify auto-convert behavior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Qty</Label>
              <Input className="w-24" inputMode="decimal" value={test.qty} onChange={(e) => setTest({ ...test, qty: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input className="w-32" value={test.from} onChange={(e) => setTest({ ...test, from: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input className="w-32" value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} />
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">
              {testResult.error
                ? <span className="text-destructive">{testResult.error}</span>
                : <>{test.qty} {normalizeUnit(test.from)} → <span className="font-semibold">{testResult.value}</span> {normalizeUnit(test.to)}</>}
            </div>
            {!testResult.error && <Badge variant="default">OK</Badge>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
