import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { convertQty, normalizeUnit, ALLOWED_BASE_UNITS } from "@/lib/server/pricing-engine/units";
import { Wand2 } from "lucide-react";

const WEIGHT_UNITS = ["lb", "lbs", "pound", "pounds", "oz", "ounce", "ounces", "g", "gram", "grams", "kg", "kilogram", "kilograms"];
const VOLUME_UNITS = ["fl oz", "floz", "fluid ounce", "fluid ounces", "cup", "cups", "c", "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons", "pt", "pint", "pints", "qt", "quart", "quarts", "gal", "gallon", "gallons", "ml", "milliliter", "milliliters", "l", "liter", "liters", "litre"];
const COUNT_UNITS = ["each", "ea", "piece", "pieces", "whole", "unit", "units", "clove", "cloves", "slice", "slices", "head", "heads", "bunch", "bunches", "sprig", "sprigs"];

function dimensionOf(u: string): "weight" | "volume" | "count" | null {
  const n = normalizeUnit(u);
  if (WEIGHT_UNITS.includes(n)) return "weight";
  if (VOLUME_UNITS.includes(n)) return "volume";
  if (COUNT_UNITS.includes(n)) return "count";
  return null;
}

function canonicalBaseFor(u: string): string | null {
  const dim = dimensionOf(u);
  if (dim === "weight") return "lb";
  if (dim === "volume") return "fl oz";
  if (dim === "count") return "each";
  return null;
}

type BatchRow = {
  qty: number;
  from: string;
  to: string;
  expected: number | null;
  actual: number | null;
  ok: boolean;
  tolerance: number;
  error?: string;
};

const SAMPLE_CSV = `qty,from,to,expected,tolerance
1,lb,oz,16,0.001
16,oz,lb,1,0.001
453.592,g,lb,1,0.001
1,kg,g,1000,0.01
1,cup,tbsp,16,0.01
1,cup,tsp,48,0.01
1,tbsp,tsp,3,0.001
1,l,ml,1000,0.01
1,gal,cup,16,0.001
1,fl oz,ml,29.5735,0.01`;

export function UnitTesterPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unit Normalization Tester</CardTitle>
        <CardDescription>
          Verify deterministic unit conversions before they feed recipe cost math. Uses the same
          <code className="mx-1 rounded bg-muted px-1 text-xs">convertQty</code> function as the engine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="single">Single conversion</TabsTrigger>
            <TabsTrigger value="batch">Batch / CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="mt-4">
            <SingleTester />
          </TabsContent>
          <TabsContent value="batch" className="mt-4">
            <BatchTester />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SingleTester() {
  const [qty, setQty] = useState("1");
  const [from, setFrom] = useState("lb");
  const [to, setTo] = useState("oz");
  const [expected, setExpected] = useState("");
  const [tolerance, setTolerance] = useState("0.001");

  const result = useMemo(() => {
    const q = Number(qty);
    if (!Number.isFinite(q)) return { actual: null as number | null, error: "qty must be a number" };
    const actual = convertQty(q, from, to);
    if (actual === null) {
      return {
        actual: null,
        error: `Incompatible units (${normalizeUnit(from) || "∅"} → ${normalizeUnit(to) || "∅"})`,
      };
    }
    return { actual, error: undefined as string | undefined };
  }, [qty, from, to]);

  const expectedNum = expected.trim() === "" ? null : Number(expected);
  const tol = Number(tolerance) || 0;
  const matches =
    result.actual !== null && expectedNum !== null && Number.isFinite(expectedNum)
      ? Math.abs(result.actual - expectedNum) <= tol
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
        </div>
        <div className="space-y-2">
          <Label>From unit</Label>
          <UnitPicker value={from} onChange={setFrom} />
        </div>
        <div className="space-y-2">
          <Label>To unit</Label>
          <UnitPicker value={to} onChange={setTo} />
        </div>
        <div className="space-y-2">
          <Label>Expected (optional)</Label>
          <Input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="e.g. 16" inputMode="decimal" />
        </div>
        <div className="space-y-2">
          <Label>Tolerance</Label>
          <Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            const base = canonicalBaseFor(from);
            if (base) setTo(base);
          }}
          disabled={!canonicalBaseFor(from) || canonicalBaseFor(from) === normalizeUnit(to)}
        >
          <Wand2 className="mr-1 h-3.5 w-3.5" />
          Auto-convert to base
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (result.actual !== null) setExpected(formatNum(result.actual));
          }}
          disabled={result.actual === null}
        >
          Auto-fill expected
        </Button>
        <span className="text-xs text-muted-foreground">
          Auto-convert picks the canonical base unit for the From dimension
          (weight → lb, volume → fl oz, count → each).
        </span>
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        {result.error ? (
          <div className="text-sm text-destructive">{result.error}</div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Result:</span>
            <span className="font-mono text-base font-semibold">
              {qty} {normalizeUnit(from)} → {formatNum(result.actual)} {normalizeUnit(to)}
            </span>
            {matches === true && <Badge variant="default">PASS</Badge>}
            {matches === false && (
              <Badge variant="destructive">
                FAIL (Δ {formatNum(Math.abs((result.actual ?? 0) - (expectedNum ?? 0)))})
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchTester() {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [ran, setRan] = useState(false);

  const run = () => {
    const parsed = parseCsv(csv);
    setRows(parsed);
    setRan(true);
  };

  const passing = rows.filter((r) => r.ok).length;
  const failing = rows.length - passing;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>CSV (columns: qty,from,to,expected,tolerance)</Label>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Header row required. <code>tolerance</code> defaults to <code>0.001</code> if omitted.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={run}>Run tests</Button>
        <Button variant="outline" onClick={() => setCsv(SAMPLE_CSV)}>
          Load sample
        </Button>
        {ran && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Badge variant="default">{passing} pass</Badge>
            <Badge variant={failing > 0 ? "destructive" : "secondary"}>{failing} fail</Badge>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Qty</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Δ</TableHead>
                <TableHead>Tol</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{r.qty}</TableCell>
                  <TableCell className="font-mono">{r.from}</TableCell>
                  <TableCell className="font-mono">{r.to}</TableCell>
                  <TableCell className="font-mono">{r.expected ?? "—"}</TableCell>
                  <TableCell className="font-mono">{formatNum(r.actual)}</TableCell>
                  <TableCell className="font-mono">
                    {r.actual !== null && r.expected !== null
                      ? formatNum(Math.abs(r.actual - r.expected))
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono">{r.tolerance}</TableCell>
                  <TableCell>
                    {r.error ? (
                      <Badge variant="destructive" title={r.error}>ERROR</Badge>
                    ) : r.ok ? (
                      <Badge variant="default">PASS</Badge>
                    ) : (
                      <Badge variant="destructive">FAIL</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function UnitPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALLOWED_BASE_UNITS.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
        {EXTRA_UNITS.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const EXTRA_UNITS = ["pt", "qt", "gal"];

function parseCsv(text: string): BatchRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
  const idx = (k: string) => header.indexOf(k);
  const iQty = idx("qty");
  const iFrom = idx("from");
  const iTo = idx("to");
  const iExp = idx("expected");
  const iTol = idx("tolerance");

  const out: BatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((s) => s.trim());
    const qty = Number(cols[iQty]);
    const from = cols[iFrom] ?? "";
    const to = cols[iTo] ?? "";
    const expected = iExp >= 0 && cols[iExp] !== "" && cols[iExp] != null ? Number(cols[iExp]) : null;
    const tolerance = iTol >= 0 && cols[iTol] !== "" && cols[iTol] != null ? Number(cols[iTol]) : 0.001;

    if (!Number.isFinite(qty)) {
      out.push({ qty, from, to, expected, actual: null, ok: false, tolerance, error: "invalid qty" });
      continue;
    }
    const actual = convertQty(qty, from, to);
    if (actual === null) {
      out.push({ qty, from, to, expected, actual: null, ok: false, tolerance, error: "incompatible units" });
      continue;
    }
    const ok = expected === null ? true : Math.abs(actual - expected) <= tolerance;
    out.push({ qty, from, to, expected, actual, ok, tolerance });
  }
  return out;
}

function formatNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)) return n.toExponential(4);
  return Number(n.toFixed(6)).toString();
}
