import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, AlertTriangle, ExternalLink, Search, X, Check } from "lucide-react";
import { toast } from "sonner";
import {
  listLowConfidenceReceiptMatches,
  setReceiptLineItemMatch,
  searchInventoryItemsForMatch,
} from "@/lib/server-fns/cost-intelligence.functions";

export const Route = createFileRoute("/admin/receipts/review-matches")({
  head: () => ({ meta: [{ title: "Receipt Match Review — Admin" }] }),
  component: ReviewMatchesPage,
});

type Row = Awaited<ReturnType<typeof listLowConfidenceReceiptMatches>>[number];

function ReviewMatchesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await listLowConfidenceReceiptMatches({ data: { confidence_threshold: threshold, limit: 100 } });
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [threshold]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.item_name.toLowerCase().includes(s));
  }, [rows, search]);

  const assign = async (r: Row, inventory_item_id: string | null) => {
    const key = `${r.receipt_id}:${r.line_index}`;
    setActing(key);
    try {
      await setReceiptLineItemMatch({ data: { receipt_id: r.receipt_id, line_index: r.line_index, inventory_item_id } });
      toast.success(inventory_item_id ? "Matched" : "Cleared match");
      await load();
    } catch (e: any) { toast.error(e?.message || "Update failed"); }
    finally { setActing(null); }
  };

  const unmatched = filtered.filter((r) => !r.matched_inventory_id).length;
  const lowConf = filtered.filter((r) => r.matched_inventory_id && (r.match_score ?? 0) < threshold).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Receipt Match Review</h1>
        <p className="text-sm text-muted-foreground">
          Review OCR line items that didn't auto-match to an inventory item or matched with low confidence. Internal use only.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription className="text-xs">
          {unmatched} unmatched · {lowConf} low-confidence (below {Math.round(threshold * 100)}%). Confirming a match writes
          <code className="px-1 mx-1 bg-muted rounded">match_source = manual_review</code> on that receipt line.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Lines awaiting review</CardTitle>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by item name…" className="pl-8 w-[220px]" />
              </div>
              <span className="text-xs text-muted-foreground">Threshold</span>
              <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="text-xs border rounded px-2 py-1 bg-background">
                <option value={0.4}>40%</option>
                <option value={0.5}>50%</option>
                <option value={0.6}>60%</option>
                <option value={0.7}>70%</option>
                <option value={0.8}>80%</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">All recent receipt lines are matched with confidence ≥ {Math.round(threshold * 100)}%. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>OCR Item</TableHead>
                    <TableHead>Qty / Unit</TableHead>
                    <TableHead>Current Match</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const key = `${r.receipt_id}:${r.line_index}`;
                    const conf = r.match_score == null ? null : Math.round(r.match_score * 100);
                    return (
                      <TableRow key={key}>
                        <TableCell className="text-xs">
                          <Link to="/admin/receipts" className="inline-flex items-center gap-1 hover:underline">
                            {r.receipt_date ?? "—"}<ExternalLink className="w-3 h-3" />
                          </Link>
                          <div className="text-muted-foreground">#{String(r.receipt_id).slice(0, 6)} · line {r.line_index + 1}</div>
                        </TableCell>
                        <TableCell className="font-medium">{r.item_name}</TableCell>
                        <TableCell className="text-sm">{r.quantity} {r.unit}</TableCell>
                        <TableCell className="text-sm">
                          {r.matched_inventory_name ? (
                            <span>{r.matched_inventory_name} <span className="text-xs text-muted-foreground">({r.match_source})</span></span>
                          ) : (
                            <Badge variant="outline" className="text-xs">unmatched</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {conf == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={conf < 50 ? "destructive" : conf < 70 ? "secondary" : "outline"}>{conf}%</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <InventoryPicker
                              defaultQuery={r.item_name}
                              disabled={acting === key}
                              onPick={(id) => assign(r, id)}
                            />
                            {r.matched_inventory_id && (
                              <Button size="sm" variant="ghost" disabled={acting === key} onClick={() => assign(r, null)} className="gap-1 text-destructive">
                                <X className="w-3 h-3" />Clear
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InventoryPicker({
  defaultQuery,
  disabled,
  onPick,
}: {
  defaultQuery: string;
  disabled?: boolean;
  onPick: (inventory_item_id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchInventoryItemsForMatch>>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const q = query.trim();
      if (!q) { setResults([]); return; }
      setSearching(true);
      try { setResults(await searchInventoryItemsForMatch({ data: { query: q, limit: 25 } })); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} className="gap-1">
          <Check className="w-3 h-3" />Match
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <div className="p-2 border-b">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search inventory…" className="h-8" />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {searching ? (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No matches.</div>
          ) : results.map((r) => (
            <button
              key={r.id}
              onClick={() => { onPick(r.id); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-0"
            >
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.unit} · {r.category ?? "uncategorized"} · ${Number(r.average_cost_per_unit ?? 0).toFixed(4)}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
