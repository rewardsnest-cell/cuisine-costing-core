import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Toggle } from "@/components/ui/toggle";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronRight,
  Filter,
  ListChecks,
  Receipt as ReceiptIcon,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listReceiptKrogerDiagnostics,
  type LineDiagnostic,
} from "@/lib/server-fns/receipt-kroger-diagnostics.functions";

export const Route = createFileRoute("/admin/receipt-kroger-diagnostics")({
  head: () => ({
    meta: [{ title: "Receipt × Kroger Match Diagnostic — Admin" }],
  }),
  component: ReceiptKrogerDiagnosticsPage,
});

type StatusKey = LineDiagnostic["kroger_status"];

const STATUS_META: Record<
  StatusKey,
  { label: string; tone: "success" | "warning" | "destructive" | "neutral"; icon: any; help: string }
> = {
  matched: {
    label: "Matched to Kroger SKU",
    tone: "success",
    icon: CheckCircle2,
    help: "At least one confirmed kroger_sku_map row is linked through ingredient_reference.",
  },
  unmapped_only: {
    label: "Candidates only (none confirmed)",
    tone: "warning",
    icon: AlertTriangle,
    help: "Kroger returned candidate SKUs but no admin has confirmed any of them yet.",
  },
  no_kroger_skus: {
    label: "No Kroger SKUs",
    tone: "warning",
    icon: AlertTriangle,
    help: "Inventory + ingredient reference exist, but no Kroger ingest has produced a SKU row yet.",
  },
  no_reference_link: {
    label: "No ingredient_reference row",
    tone: "destructive",
    icon: AlertTriangle,
    help: "Matched inventory item has no row in ingredient_reference, so it can never link to a Kroger SKU.",
  },
  no_inventory_match: {
    label: "No inventory match",
    tone: "destructive",
    icon: AlertTriangle,
    help: "The receipt extraction never matched this line to an inventory item. Match it at /admin/receipts/review-matches first.",
  },
};

function ReceiptKrogerDiagnosticsPage() {
  const [lines, setLines] = useState<LineDiagnostic[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [receiptsScanned, setReceiptsScanned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState("10");
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const n = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
      const res = await listReceiptKrogerDiagnostics({
        data: { receipt_limit: n, only_unmatched: onlyUnmatched },
      });
      setLines(res.lines);
      setLocationId(res.location_id);
      setReceiptsScanned(res.receipts_scanned);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (statusFilters.size > 0 && !statusFilters.has(l.kroger_status)) return false;
      if (q) {
        const hay = `${l.item_name} ${l.matched_inventory_name ?? ""} ${l.reference_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lines, search, statusFilters]);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = {
      matched: 0,
      unmapped_only: 0,
      no_kroger_skus: 0,
      no_reference_link: 0,
      no_inventory_match: 0,
    };
    for (const l of lines) c[l.kroger_status]++;
    return c;
  }, [lines]);

  const toggleStatus = (k: StatusKey) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Receipt × Kroger Match Diagnostic</h1>
          <p className="text-sm text-muted-foreground">
            For each receipt line item: did it match an inventory item, was that item linked to a
            Kroger SKU, and what would the Kroger query look like?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/kroger-runs">
            <Button size="sm" variant="outline" className="gap-1">
              <ExternalLink className="w-3.5 h-3.5" />
              Kroger runs
            </Button>
          </Link>
          <Link to="/admin/kroger-sku-review">
            <Button size="sm" variant="outline" className="gap-1">
              <ListChecks className="w-3.5 h-3.5" />
              SKU review
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Receipts to scan (most recent)</label>
            <div className="flex items-center gap-1">
              <Input
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-8 w-20"
                placeholder="10"
              />
              <Button size="sm" variant="outline" className="h-8" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Search line / inventory / reference</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64"
              placeholder="e.g. shrimp"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Hide already-matched</label>
            <Toggle
              size="sm"
              pressed={onlyUnmatched}
              onPressedChange={(v) => {
                setOnlyUnmatched(v);
                setTimeout(load, 0);
              }}
              className="h-8"
            >
              {onlyUnmatched ? "Only problems" : "All lines"}
            </Toggle>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Kroger location:{" "}
            <span className="font-mono text-foreground">{locationId ?? "(none set)"}</span>
            <span className="ml-3">
              Receipts scanned: <span className="text-foreground">{receiptsScanned}</span>
            </span>
            <span className="ml-3">
              Lines: <span className="text-foreground">{lines.length}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {!locationId && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>No Kroger location_id is configured</AlertTitle>
          <AlertDescription>
            Kroger requires a valid 8-digit locationId to return prices. Without it, every "no
            Kroger SKUs" row below will keep coming back empty even after a re-run. Set it at{" "}
            <Link to="/admin/kroger-pricing" className="underline">
              /admin/kroger-pricing
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter by outcome
            </CardTitle>
            {statusFilters.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setStatusFilters(new Set())}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_META) as StatusKey[]).map((k) => {
            const meta = STATUS_META[k];
            const Icon = meta.icon;
            const active = statusFilters.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleStatus(k)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
                title={meta.help}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{meta.label}</span>
                <Badge variant="outline" className="ml-1 tabular-nums">
                  {counts[k]}
                </Badge>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptIcon className="w-4 h-4" />
            Line items ({filtered.length} of {lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines match the current filters.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((l, i) => (
                <LineCard key={`${l.receipt_id}-${l.line_index}-${i}`} line={l} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LineCard({ line }: { line: LineDiagnostic }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[line.kroger_status];
  const Icon = meta.icon;
  const toneClasses =
    meta.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : meta.tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : meta.tone === "destructive"
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/20";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-md border ${toneClasses}`}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/30 transition-colors rounded-md"
          >
            <span className="mt-0.5 text-muted-foreground">
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium truncate">{line.item_name || "(no name)"}</span>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </Badge>
                {line.kroger_status === "matched" && (
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {line.kroger_skus.filter((s) => s.status === "confirmed").length} confirmed
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground truncate">
                Receipt {line.receipt_id.slice(0, 8)}… · line {line.line_index} ·{" "}
                {line.quantity} {line.unit} @ ${line.unit_price.toFixed(2)}
                {line.matched_inventory_name && (
                  <>
                    {" · inv: "}
                    <span className="text-foreground">{line.matched_inventory_name}</span>
                  </>
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-3 text-xs">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>{line.kroger_reason}</AlertDescription>
            </Alert>

            <div className="grid md:grid-cols-2 gap-3">
              <Section title="Inventory match (from receipt extraction)">
                <KV k="matched_inventory_id" v={line.matched_inventory_id ?? "—"} mono />
                <KV k="matched_inventory_name" v={line.matched_inventory_name ?? "—"} />
                <KV
                  k="match_score"
                  v={line.match_score == null ? "—" : line.match_score.toFixed(3)}
                />
                <KV k="match_source" v={line.match_source ?? "—"} />
              </Section>

              <Section title="Ingredient reference link">
                <KV k="reference_id" v={line.reference_id ?? "—"} mono />
                <KV k="reference_name" v={line.reference_name ?? "—"} />
              </Section>
            </div>

            <Section title="Kroger query that would be sent for this line name">
              <KV k="raw_term" v={line.kroger_query.raw_term} />
              <KV
                k="cleaned_term"
                v={`"${line.kroger_query.cleaned_term}" (${line.kroger_query.cleaned_length} chars)`}
                mono
              />
              <KV k="filter.locationId" v={line.kroger_query.location_id ?? "(none — no prices)"} />
              <KV k="filter.limit" v="5" />
              <KV
                k="will_send"
                v={
                  line.kroger_query.will_send
                    ? "yes"
                    : `no — ${line.kroger_query.skip_reason}`
                }
              />
            </Section>

            <Section
              title={`Kroger SKUs linked via ingredient_reference (${line.kroger_skus.length})`}
            >
              {line.kroger_skus.length === 0 ? (
                <p className="text-muted-foreground italic">No rows in kroger_sku_map.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="text-left py-1 pr-3">SKU</th>
                        <th className="text-left py-1 pr-3">Product</th>
                        <th className="text-left py-1 pr-3">Status</th>
                        <th className="text-right py-1 pr-3">Conf.</th>
                        <th className="text-right py-1 pr-3">Reg.</th>
                        <th className="text-right py-1 pr-3">Promo</th>
                        <th className="text-left py-1 pr-3">Unit</th>
                        <th className="text-left py-1">Observed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.kroger_skus.map((s) => (
                        <tr key={s.id} className="border-b border-border/50 last:border-0">
                          <td className="py-1 pr-3 font-mono">{s.sku}</td>
                          <td className="py-1 pr-3 truncate max-w-[16rem]" title={s.product_name ?? ""}>
                            {s.product_name ?? "—"}
                          </td>
                          <td className="py-1 pr-3">
                            <Badge
                              variant={s.status === "confirmed" ? "secondary" : "outline"}
                              className="text-[10px]"
                            >
                              {s.status}
                            </Badge>
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {s.match_confidence == null ? "—" : s.match_confidence.toFixed(2)}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {s.regular_price == null ? "—" : `$${s.regular_price.toFixed(2)}`}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {s.promo_price == null ? "—" : `$${s.promo_price.toFixed(2)}`}
                          </td>
                          <td className="py-1 pr-3">{s.price_unit_size ?? "—"}</td>
                          <td className="py-1 whitespace-nowrap">
                            {s.price_observed_at
                              ? new Date(s.price_observed_at).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[12rem_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={`break-all ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
