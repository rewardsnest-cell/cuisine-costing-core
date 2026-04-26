import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, CheckCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  bulkSuggestUpcsForInventory,
  bulkApproveUpcMappings,
  type BulkSuggestion,
  type KrogerSearchHit,
} from "@/lib/server-fns/pricing-v2-search.functions";

export const Route = createFileRoute("/admin/pricing-v2/bulk-suggest")({
  head: () => ({ meta: [{ title: "Bulk UPC Auto-Suggest — Pricing v2" }] }),
  component: BulkSuggestPage,
});

function fmtPrice(n?: number) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function BulkSuggestPage() {
  const [limit, setLimit] = useState(25);
  const [hitsPerItem, setHitsPerItem] = useState(5);
  const [storeId, setStoreId] = useState("");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<BulkSuggestion[]>([]);
  // inventoryItemId -> selected UPC (empty/undefined = skipped)
  const [picks, setPicks] = useState<Record<string, string>>({});

  const suggest = useMutation({
    mutationFn: () =>
      bulkSuggestUpcsForInventory({
        data: {
          limit,
          hitsPerItem,
          storeId: storeId.trim() || undefined,
          search: search.trim() || undefined,
        },
      }),
    onSuccess: (res) => {
      setSuggestions(res.suggestions);
      // Pre-select the first hit for each item as a sensible default.
      const next: Record<string, string> = {};
      for (const s of res.suggestions) {
        const first = s.hits[0];
        if (first?.upc) next[s.inventoryItemId] = first.upc;
      }
      setPicks(next);
      toast.success(`Suggested matches for ${res.count} items`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () => {
      const mappings = Object.entries(picks)
        .filter(([, upc]) => upc && upc.length >= 6)
        .map(([inventoryItemId, upc]) => ({ inventoryItemId, upc }));
      if (!mappings.length) {
        return Promise.reject(new Error("No mappings selected"));
      }
      return bulkApproveUpcMappings({ data: { mappings } });
    },
    onSuccess: (res) => {
      toast.success(
        `Approved ${res.updated} mappings${res.errors.length ? ` (${res.errors.length} errors)` : ""}`
      );
      // Remove approved items from the list so the UI reflects progress.
      const approvedIds = new Set(
        Object.entries(picks)
          .filter(([id, upc]) => upc && !res.errors.some((e) => e.inventoryItemId === id))
          .map(([id]) => id)
      );
      setSuggestions((prev) => prev.filter((s) => !approvedIds.has(s.inventoryItemId)));
      setPicks((prev) => {
        const copy = { ...prev };
        for (const id of approvedIds) delete copy[id];
        return copy;
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedCount = useMemo(
    () => Object.values(picks).filter((u) => u && u.length >= 6).length,
    [picks]
  );

  function selectAllFirst() {
    const next: Record<string, string> = {};
    for (const s of suggestions) {
      const first = s.hits[0];
      if (first?.upc) next[s.inventoryItemId] = first.upc;
    }
    setPicks(next);
  }

  function clearAll() {
    setPicks({});
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/pricing-v2"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Pricing v2
        </Link>
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Bulk UPC Auto-Suggest
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run a Kroger keyword search for every unmapped inventory item and approve
          matches in one click.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Suggest matches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Items to process
              </Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Hits per item
              </Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={hitsPerItem}
                onChange={(e) => setHitsPerItem(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Store ID (optional)
              </Label>
              <Input
                placeholder="default from settings"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Filter by name (optional)
              </Label>
              <Input
                placeholder="e.g. flour"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              {suggest.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {suggest.isPending ? "Searching Kroger…" : "Auto-suggest matches"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              2. Review &amp; approve ({selectedCount} selected of {suggestions.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllFirst}>
                Select first hit for all
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear all
              </Button>
              <Button
                onClick={() => approve.mutate()}
                disabled={approve.isPending || selectedCount === 0}
              >
                {approve.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4 mr-2" />
                )}
                Approve {selectedCount} mappings
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.inventoryItemId}
                suggestion={s}
                selectedUpc={picks[s.inventoryItemId] ?? ""}
                onSelect={(upc) =>
                  setPicks((p) => ({ ...p, [s.inventoryItemId]: upc }))
                }
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  selectedUpc,
  onSelect,
}: {
  suggestion: BulkSuggestion;
  selectedUpc: string;
  onSelect: (upc: string) => void;
}) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium text-sm">{suggestion.inventoryName}</div>
          <div className="text-xs text-muted-foreground">
            {suggestion.category ?? "uncategorized"} · unit: {suggestion.unit ?? "—"} ·
            query: <span className="font-mono">{suggestion.query}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {suggestion.error ? (
            <Badge variant="destructive">{suggestion.error}</Badge>
          ) : suggestion.hits.length === 0 ? (
            <Badge variant="secondary">No matches</Badge>
          ) : (
            <Badge variant="outline">{suggestion.hits.length} hits</Badge>
          )}
          <Button
            size="sm"
            variant={selectedUpc ? "outline" : "ghost"}
            onClick={() => onSelect("")}
            disabled={!selectedUpc}
          >
            Skip
          </Button>
        </div>
      </div>
      {suggestion.hits.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {suggestion.hits.map((h) => (
            <HitCard
              key={h.productId}
              hit={h}
              selected={selectedUpc === (h.upc ?? h.productId)}
              onSelect={() => onSelect(h.upc ?? h.productId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HitCard({
  hit,
  selected,
  onSelect,
}: {
  hit: KrogerSearchHit;
  selected: boolean;
  onSelect: () => void;
}) {
  const upc = hit.upc ?? hit.productId;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded border p-2 transition-colors hover:bg-accent ${
        selected ? "border-primary bg-accent/50" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium line-clamp-2">{hit.description ?? upc}</div>
        {selected && <Badge className="shrink-0">Selected</Badge>}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">
        {hit.brand ?? "—"} · {hit.size ?? "—"}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{upc}</div>
      <div className="text-[11px] mt-1">
        Reg {fmtPrice(hit.regularPrice)} · Promo {fmtPrice(hit.promoPrice)}
      </div>
    </button>
  );
}
