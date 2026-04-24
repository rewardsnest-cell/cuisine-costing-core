import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, Check, X, RotateCcw, Link2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  listKrogerSkuMap,
  searchIngredientReferences,
  confirmKrogerSkuMapping,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-sku-review")({
  head: () => ({ meta: [{ title: "Kroger SKU Review — Admin" }] }),
  component: KrogerSkuReviewPage,
});

type Row = Awaited<ReturnType<typeof listKrogerSkuMap>>[number];
type RefRow = Awaited<ReturnType<typeof searchIngredientReferences>>[number];

function KrogerSkuReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unmapped" | "confirmed" | "rejected" | "all">("unmapped");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listKrogerSkuMap({
        data: {
          status: filter === "all" ? undefined : filter,
          search: search.trim() || undefined,
          limit: 200,
        },
      });
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load SKU map");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const counts = useMemo(() => {
    const c = { unmapped: 0, confirmed: 0, rejected: 0 };
    for (const r of rows) {
      if (r.status === "unmapped" || r.status === "confirmed" || r.status === "rejected") {
        c[r.status]++;
      }
    }
    return c;
  }, [rows]);

  const onAction = async (id: string, status: "confirmed" | "rejected" | "unmapped", reference_id: string | null) => {
    setBusyId(id);
    try {
      await confirmKrogerSkuMapping({ data: { id, status, reference_id } });
      toast.success(
        status === "confirmed" ? "SKU mapped to ingredient" :
        status === "rejected" ? "SKU rejected" :
        "SKU returned to unmapped",
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Kroger SKU Review</h1>
        <p className="text-sm text-muted-foreground">
          Confirm or reject Kroger SKUs. Confirmed mappings are linked to an ingredient reference for stronger price signals.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="unmapped">Unmapped</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <form
          className="flex items-center gap-2 ml-auto"
          onSubmit={(e) => { e.preventDefault(); load(); }}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or product…"
              className="pl-7 h-9 w-64"
            />
          </div>
          <Button size="sm" type="submit" variant="outline">Search</Button>
        </form>
      </div>

      <MatchingBreakdown rows={rows} loading={loading} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-3">
            <span>{filter === "all" ? "All SKUs" : filter[0].toUpperCase() + filter.slice(1)}</span>
            <Badge variant="outline" className="text-xs">{rows.length} shown</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SKUs in this view.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked ingredient</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <SkuRow
                      key={r.id}
                      row={r}
                      busy={busyId === r.id}
                      onAction={onAction}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SkuRow({ row, busy, onAction }: { row: Row; busy: boolean; onAction: (id: string, status: "confirmed" | "rejected" | "unmapped", refId: string | null) => void }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
      <TableCell className="max-w-md">
        <div className="text-sm font-medium truncate">{row.product_name ?? "—"}</div>
        {row.notes && <div className="text-xs text-muted-foreground truncate">{row.notes}</div>}
      </TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell>
        {row.reference_id ? (
          <Badge variant="secondary" className="gap-1"><Link2 className="w-3 h-3" />{(row as any).reference_name ?? row.reference_id.slice(0, 8)}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(row.last_seen_at).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          {row.status !== "confirmed" && (
            <ConfirmPopover
              row={row}
              busy={busy}
              onConfirm={(refId) => onAction(row.id, "confirmed", refId)}
            />
          )}
          {row.status !== "rejected" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(row.id, "rejected", null)} className="gap-1 h-7">
              <X className="w-3 h-3" /> Reject
            </Button>
          )}
          {row.status !== "unmapped" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(row.id, "unmapped", null)} className="gap-1 h-7">
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ConfirmPopover({ row, busy, onConfirm }: { row: Row; busy: boolean; onConfirm: (refId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(row.product_name ?? "");
  const [results, setResults] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (search.trim().length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const r = await searchIngredientReferences({ data: { search: search.trim(), limit: 20 } });
        setResults(r);
      } catch (e: any) {
        toast.error(e?.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="default" disabled={busy} className="gap-1 h-7">
          <Check className="w-3 h-3" /> Confirm
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-2">
        <div className="text-xs font-medium">Link to ingredient reference</div>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ingredient name…"
          className="h-8"
        />
        <div className="max-h-60 overflow-auto border rounded">
          {loading ? (
            <div className="p-2 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">{search.trim().length < 2 ? "Type 2+ characters" : "No matches"}</div>
          ) : results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted border-b last:border-0"
              onClick={() => { onConfirm(r.id); setOpen(false); }}
            >
              <div className="font-medium">{r.canonical_name}</div>
              <div className="text-muted-foreground text-[10px]">unit: {r.default_unit}{r.inventory_item_id ? " · linked to inventory" : ""}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "confirmed" ? "secondary" :
    status === "rejected" ? "destructive" :
    status === "suggested" ? "default" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
