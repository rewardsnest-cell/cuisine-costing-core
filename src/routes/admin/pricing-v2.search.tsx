import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Copy, Check, Store } from "lucide-react";
import { toast } from "sonner";
import {
  searchKrogerProducts,
  type KrogerSearchHit,
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
          to grab UPCs, sizes, and prices for your catalog.
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
                    copiedUpc={copied}
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
    </div>
  );
}

function ResultRow({
  hit,
  selected,
  onToggle,
  onCopyUpc,
  copiedUpc,
}: {
  hit: KrogerSearchHit;
  selected: boolean;
  onToggle: () => void;
  onCopyUpc: (upc: string) => void;
  copiedUpc: string | null;
}) {
  const upc = hit.upc || hit.productId;
  const onSale = hit.promoPrice != null && hit.regularPrice != null && hit.promoPrice < hit.regularPrice;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:bg-muted/40"
      }`}
    >
      <div
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
        }`}
      >
        {selected && <Check className="w-3 h-3" />}
      </div>
      <div className="flex-1 min-w-0">
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
      </div>
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
        onClick={(e) => {
          e.stopPropagation();
          onCopyUpc(upc);
        }}
        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground"
        title="Copy UPC"
      >
        {copiedUpc === upc ? (
          <Check className="w-3.5 h-3.5 text-success" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </button>
  );
}
