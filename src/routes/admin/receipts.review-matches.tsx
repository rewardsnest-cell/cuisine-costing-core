import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, ExternalLink, Search, X, Check, ArrowRight } from "lucide-react";
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
type InvRow = Awaited<ReturnType<typeof searchInventoryItemsForMatch>>[number];

function ReviewMatchesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listLowConfidenceReceiptMatches({
        data: { confidence_threshold: threshold, limit: 100 },
      });
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.item_name.toLowerCase().includes(s));
  }, [rows, search]);

  const applyMatch = async (r: Row, inventory_item_id: string | null) => {
    const key = `${r.receipt_id}:${r.line_index}`;
    setActing(key);
    try {
      await setReceiptLineItemMatch({
        data: { receipt_id: r.receipt_id, line_index: r.line_index, inventory_item_id },
      });
      toast.success(inventory_item_id ? "Match applied" : "Match cleared");
      setReviewing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setActing(null);
    }
  };

  const unmatched = filtered.filter((r) => !r.matched_inventory_id).length;
  const lowConf = filtered.filter((r) => r.matched_inventory_id && (r.match_score ?? 0) < threshold).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Receipt Match Review</h1>
        <p className="text-sm text-muted-foreground">
          Review OCR line items that didn't auto-match to an inventory item or matched with low confidence. Click "Review"
          to see the suggested match and previous vs new diff before applying.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription className="text-xs">
          {unmatched} unmatched · {lowConf} low-confidence (below {Math.round(threshold * 100)}%). Confirming a match writes
          <code className="px-1 mx-1 bg-muted rounded">match_source = manual_review</code> on that receipt line and logs an audit entry.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Lines awaiting review</CardTitle>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by item name…"
                  className="pl-8 w-[220px]"
                />
              </div>
              <span className="text-xs text-muted-foreground">Threshold</span>
              <select
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="text-xs border rounded px-2 py-1 bg-background"
              >
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
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All recent receipt lines are matched with confidence ≥ {Math.round(threshold * 100)}%. 🎉
            </p>
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
                            {r.receipt_date ?? "—"}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                          <div className="text-muted-foreground">
                            #{String(r.receipt_id).slice(0, 6)} · line {r.line_index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{r.item_name}</TableCell>
                        <TableCell className="text-sm">
                          {r.quantity} {r.unit}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.matched_inventory_name ? (
                            <span>
                              {r.matched_inventory_name}{" "}
                              <span className="text-xs text-muted-foreground">({r.match_source})</span>
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              unmatched
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {conf == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={conf < 50 ? "destructive" : conf < 70 ? "secondary" : "outline"}>
                              {conf}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === key}
                              onClick={() => setReviewing(r)}
                              className="gap-1"
                            >
                              <Check className="w-3 h-3" />
                              Review
                            </Button>
                            {r.matched_inventory_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acting === key}
                                onClick={() => applyMatch(r, null)}
                                className="gap-1 text-destructive"
                              >
                                <X className="w-3 h-3" />
                                Clear
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

      <ReviewMatchDialog
        row={reviewing}
        onClose={() => setReviewing(null)}
        onApply={(invId) => reviewing && applyMatch(reviewing, invId)}
        busy={!!reviewing && acting === `${reviewing.receipt_id}:${reviewing.line_index}`}
      />
    </div>
  );
}

function ReviewMatchDialog({
  row,
  onClose,
  onApply,
  busy,
}: {
  row: Row | null;
  onClose: () => void;
  onApply: (inventory_item_id: string | null) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<InvRow | null>(null);

  // Initialise & auto-search by OCR name when modal opens
  useEffect(() => {
    if (!row) {
      setQuery("");
      setResults([]);
      setSelected(null);
      return;
    }
    setQuery(row.item_name);
    setSelected(null);
  }, [row?.receipt_id, row?.line_index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!row) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchInventoryItemsForMatch({ data: { query: q, limit: 25 } });
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, row]);

  const currentConfidence = row?.match_score == null ? null : Math.round(row.match_score * 100);
  const topSuggestion = results[0] ?? null;
  const previewMatch = selected ?? topSuggestion;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review match</DialogTitle>
          <DialogDescription>
            Inspect the OCR line, the suggested inventory match, and the exact previous → new diff before applying.
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            {/* OCR line */}
            <section className="border rounded-md p-3 bg-muted/30 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">OCR line</div>
              <div className="text-sm font-medium">{row.item_name}</div>
              <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                <div>
                  <div className="font-medium text-foreground">Qty</div>
                  <div>
                    {row.quantity} {row.unit}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">Unit price</div>
                  <div>${Number(row.unit_price ?? 0).toFixed(4)}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">Receipt</div>
                  <div>
                    #{String(row.receipt_id).slice(0, 6)} · line {row.line_index + 1}
                  </div>
                </div>
              </div>
            </section>

            {/* Diff: previous vs new */}
            <section className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
              <DiffCard
                title="Previous match"
                tone="muted"
                name={row.matched_inventory_name}
                source={row.match_source}
                confidence={currentConfidence}
              />
              <div className="hidden sm:flex items-center justify-center text-muted-foreground">
                <ArrowRight className="w-4 h-4" />
              </div>
              <DiffCard
                title="New match (preview)"
                tone={previewMatch ? "primary" : "muted"}
                name={previewMatch?.name ?? null}
                source={previewMatch ? "manual_review" : null}
                confidence={previewMatch ? 100 : null}
                subtitle={
                  previewMatch
                    ? `${previewMatch.unit} · $${Number(previewMatch.average_cost_per_unit ?? 0).toFixed(4)} avg`
                    : "Pick a suggestion below"
                }
              />
            </section>

            {/* Inventory search */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Suggested matches
                </div>
                {searching && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search inventory…"
                  className="pl-8 h-9"
                  autoFocus
                />
              </div>
              <div className="border rounded-md max-h-64 overflow-y-auto">
                {results.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    {query.trim() ? "No matches." : "Type to search."}
                  </div>
                ) : (
                  results.map((r, i) => {
                    const isSelected = selected?.id === r.id || (!selected && i === 0);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(r)}
                        className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors ${
                          isSelected ? "bg-accent" : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{r.name}</span>
                          {i === 0 && !selected && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              top suggestion
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.unit} · {r.category ?? "uncategorized"} · $
                          {Number(r.average_cost_per_unit ?? 0).toFixed(4)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {row?.matched_inventory_id && (
            <Button
              variant="outline"
              onClick={() => onApply(null)}
              disabled={busy}
              className="gap-1 text-destructive"
            >
              <X className="w-3.5 h-3.5" />
              Clear current match
            </Button>
          )}
          <Button onClick={() => previewMatch && onApply(previewMatch.id)} disabled={busy || !previewMatch} className="gap-1">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Apply match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffCard({
  title,
  tone,
  name,
  source,
  confidence,
  subtitle,
}: {
  title: string;
  tone: "primary" | "muted";
  name: string | null;
  source: string | null;
  confidence: number | null;
  subtitle?: string;
}) {
  return (
    <div
      className={`border rounded-md p-3 ${
        tone === "primary" ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      {name ? (
        <>
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
            {source && (
              <Badge variant="outline" className="text-[10px]">
                {source}
              </Badge>
            )}
            {confidence != null && <span>{confidence}% confidence</span>}
          </div>
          {subtitle && <div className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</div>}
        </>
      ) : (
        <div className="text-xs text-muted-foreground italic">{subtitle ?? "No match"}</div>
      )}
    </div>
  );
}
