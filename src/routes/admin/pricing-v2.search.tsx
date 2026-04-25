import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Copy, Check, Store, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  searchKrogerProducts,
  listInventoryForMapping,
  mapUpcToInventoryItem,
  type KrogerSearchHit,
  type InventoryItemLite,
} from "@/lib/server-fns/pricing-v2-search.functions";

export const Route = createFileRoute("/admin/pricing-v2/search")({
  head: () => ({ meta: [{ title: "Kroger Product Search — Pricing v2" }] }),
  component: KrogerSearchPage,
});

function fmtPrice(n?: number) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function KrogerSearchPage() {
  const [term, setTerm] = useState("");
  const [storeId, setStoreId] = useState("");
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [mapTarget, setMapTarget] = useState<KrogerSearchHit | null>(null);

  const search = useMutation({
    mutationFn: (vars: { term: string; limit: number; storeId?: string }) =>
      searchKrogerProducts({ data: vars }),
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = term.trim();
    if (!t) return;
    setSelected(new Set());
    search.mutate({ term: t, limit, storeId: storeId.trim() || undefined });
  };

  const toggle = (productId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const copyUpc = async (upc: string) => {
    try {
      await navigator.clipboard.writeText(upc);
      setCopied(upc);
      setTimeout(() => setCopied((c) => (c === upc ? null : c)), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  const copySelectedUpcs = async () => {
    const hits = search.data?.hits ?? [];
    const upcs = hits
      .filter((h) => selected.has(h.productId))
      .map((h) => h.upc || h.productId)
      .filter(Boolean);
    if (!upcs.length) return;
    await navigator.clipboard.writeText(upcs.join("\n"));
    toast.success(`Copied ${upcs.length} UPC${upcs.length === 1 ? "" : "s"}`);
  };

  const hits = search.data?.hits ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Kroger Product Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search the live Kroger Products API by ingredient name. Pick matches
          to grab UPCs, sizes, and prices — or map a UPC directly onto an
          inventory item so the next{" "}
          <Link to="/admin/pricing-v2/catalog" className="underline">
            catalog bootstrap
          </Link>{" "}
          fetches it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={submit}
            className="grid grid-cols-1 md:grid-cols-[1fr_140px_120px_auto] gap-3 items-end"
          >
            <div>
              <Label htmlFor="term">Ingredient / keyword</Label>
              <Input
                id="term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="e.g. chicken breast"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="store">Store ID (optional)</Label>
              <Input
                id="store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="default settings"
              />
            </div>
            <div>
              <Label htmlFor="limit">Limit</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 25)))}
              />
            </div>
            <Button type="submit" disabled={search.isPending} className="gap-2">
              {search.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {search.data && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                {search.data.count} result{search.data.count === 1 ? "" : "s"}
                <span className="ml-2 text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
                  <Store className="w-3 h-3" /> store {search.data.storeId}
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Term: <span className="font-mono">{search.data.term}</span>
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={copySelectedUpcs}
              className="gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy {selected.size} UPC{selected.size === 1 ? "" : "s"}
            </Button>
          </CardHeader>
          <CardContent>
            {hits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No matches. Try a broader term.
              </p>
            ) : (
              <div className="space-y-1.5">
                {hits.map((h) => (
                  <ResultRow
                    key={h.productId}
                    hit={h}
                    selected={selected.has(h.productId)}
                    onToggle={() => toggle(h.productId)}
                    onCopyUpc={copyUpc}
                    onMap={() => setMapTarget(h)}
                    copiedUpc={copied}
                    defaultPrefill={term}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {search.error && !search.data && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {(search.error as Error).message}
          </CardContent>
        </Card>
      )}

      <MapDialog hit={mapTarget} onClose={() => setMapTarget(null)} defaultPrefill={term} />
    </div>
  );
}

function ResultRow({
  hit,
  selected,
  onToggle,
  onCopyUpc,
  onMap,
  copiedUpc,
}: {
  hit: KrogerSearchHit;
  selected: boolean;
  onToggle: () => void;
  onCopyUpc: (upc: string) => void;
  onMap: () => void;
  copiedUpc: string | null;
  defaultPrefill: string;
}) {
  const upc = hit.upc || hit.productId;
  const onSale = hit.promoPrice != null && hit.regularPrice != null && hit.promoPrice < hit.regularPrice;
  return (
    <div
      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:bg-muted/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
        }`}
        aria-label="Select"
      >
        {selected && <Check className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {hit.description || "(no description)"}
          </span>
          {hit.brand && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {hit.brand}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
          <span className="font-mono">{upc}</span>
          {hit.size && <span>{hit.size}</span>}
          {hit.soldBy && <span className="uppercase">{hit.soldBy}</span>}
        </div>
      </button>
      <div className="text-right shrink-0">
        {onSale ? (
          <>
            <div className="font-display font-bold text-success">{fmtPrice(hit.promoPrice)}</div>
            <div className="text-[10px] text-muted-foreground line-through">
              {fmtPrice(hit.regularPrice)}
            </div>
          </>
        ) : (
          <div className="font-display font-bold">{fmtPrice(hit.regularPrice)}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onMap}
        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground"
        title="Map to inventory item"
      >
        <Link2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onCopyUpc(upc)}
        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground"
        title="Copy UPC"
      >
        {copiedUpc === upc ? (
          <Check className="w-3.5 h-3.5 text-success" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

function MapDialog({
  hit,
  onClose,
  defaultPrefill,
}: {
  hit: KrogerSearchHit | null;
  onClose: () => void;
  defaultPrefill: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState(defaultPrefill);
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["pricing-v2", "inv-for-mapping", search, onlyUnmapped],
    queryFn: () =>
      listInventoryForMapping({
        data: { search: search.trim() || undefined, onlyUnmapped, limit: 100 },
      }),
    enabled: !!hit,
  });

  const upc = hit?.upc || hit?.productId || "";

  const mapMut = useMutation({
    mutationFn: (vars: { inventoryItemId: string; upc: string }) =>
      mapUpcToInventoryItem({ data: vars }),
    onSuccess: (res: any) => {
      toast.success(`Mapped UPC to "${res.item.name}"`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "inv-for-mapping"] });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog-data"] });
      onClose();
      setPickedId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!hit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Map UPC to inventory item</DialogTitle>
        </DialogHeader>
        {hit && (
          <div className="space-y-4">
            <div className="text-sm border rounded-md p-3 bg-muted/30">
              <div className="font-medium">{hit.description}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                <span className="font-mono">{upc}</span>
                {hit.brand && <span>{hit.brand}</span>}
                {hit.size && <span>{hit.size}</span>}
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <Input
                placeholder="Filter inventory items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={onlyUnmapped}
                  onChange={(e) => setOnlyUnmapped(e.target.checked)}
                />
                Unmapped only
              </label>
            </div>

            <div className="border rounded-md max-h-72 overflow-y-auto divide-y divide-border/40">
              {list.isLoading ? (
                <p className="p-3 text-sm text-muted-foreground">Loading…</p>
              ) : (list.data?.items.length ?? 0) === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching inventory items.
                </p>
              ) : (
                list.data!.items.map((it: InventoryItemLite) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setPickedId(it.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center gap-3 ${
                      pickedId === it.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full border ${
                        pickedId === it.id ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                        {it.category && <span>{it.category}</span>}
                        {it.unit && <span>· {it.unit}</span>}
                        {it.kroger_product_id && (
                          <span className="font-mono text-amber-600">
                            already → {it.kroger_product_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                disabled={!pickedId || mapMut.isPending}
                onClick={() =>
                  pickedId && mapMut.mutate({ inventoryItemId: pickedId, upc })
                }
              >
                {mapMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Map UPC
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
