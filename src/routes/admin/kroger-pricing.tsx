import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, Activity, KeyRound, PlayCircle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  getKrogerStatus,
  setKrogerEnabled,
  ingestKrogerPrices,
  getKrogerSignals,
  listKrogerSkuMap,
} from "@/lib/server-fns/kroger-pricing.functions";

export const Route = createFileRoute("/admin/kroger-pricing")({
  head: () => ({
    meta: [{ title: "Kroger Pricing — Admin" }],
  }),
  component: KrogerPricingPage,
});

type Status = Awaited<ReturnType<typeof getKrogerStatus>>;
type Signal = Awaited<ReturnType<typeof getKrogerSignals>>[number];
type SkuRow = Awaited<ReturnType<typeof listKrogerSkuMap>>[number];

const FLAG_LABEL: Record<Signal["flag"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ok: { label: "OK", variant: "secondary" },
  no_signal: { label: "No signal", variant: "outline" },
  inventory_cheap: { label: "Inventory cheap vs Kroger", variant: "destructive" },
  inventory_expensive: { label: "Inventory expensive vs Kroger", variant: "destructive" },
  stale_inventory: { label: "Stale inventory", variant: "destructive" },
};

function KrogerPricingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [skuRows, setSkuRows] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, sig, skus] = await Promise.all([
        getKrogerStatus(),
        getKrogerSignals(),
        listKrogerSkuMap({ data: { limit: 50 } }),
      ]);
      setStatus(s);
      setSignals(sig);
      setSkuRows(skus);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load Kroger status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await setKrogerEnabled({ data: { enabled } });
      toast.success(enabled ? "Kroger ingest enabled" : "Kroger ingest disabled");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update flag");
    } finally {
      setToggling(false);
    }
  };

  const onRunIngest = async () => {
    setRunning(true);
    try {
      const res = await ingestKrogerPrices();
      if (res.ran) toast.success(res.message);
      else toast.message(res.message);
    } catch (e: any) {
      toast.error(e?.message || "Ingest failed");
    } finally {
      setRunning(false);
    }
  };

  const flaggedSignals = signals.filter((s) => s.flag !== "ok" && s.flag !== "no_signal");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Kroger Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Retail benchmark signal. Kroger data is <span className="font-medium">never</span> used to update inventory, recipe, or quote pricing —
          it only surfaces sanity checks for admins.
        </p>
      </div>

      <Alert>
        <Info className="w-4 h-4" />
        <AlertTitle>Signal-only integration</AlertTitle>
        <AlertDescription>
          When enabled, Kroger prices land in <code>price_history</code> tagged <code>source=kroger_api</code>. They do not modify any
          inventory or recipe cost. Disabling the flag stops all ingestion immediately.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" /> Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !status ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={status.enabled} disabled={toggling} onCheckedChange={onToggle} />
                  <span className="text-sm font-medium">{status.enabled ? "Ingest enabled" : "Ingest disabled"}</span>
                </div>
                {status.keys_configured ? (
                  <Badge variant="secondary" className="gap-1"><KeyRound className="w-3 h-3" />API keys configured</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" />Missing: {status.missing_keys.join(", ")}</Badge>
                )}
                <Button size="sm" variant="outline" onClick={onRunIngest} disabled={running} className="gap-1">
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Run ingest
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Stat label="Confirmed SKUs" value={status.mapped_skus} />
                <Stat label="Unmapped SKUs" value={status.unmapped_skus} />
                <Stat label="Price rows" value={status.price_history_rows} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sanity-check signals (read-only)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : flaggedSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flagged items. {signals.length === 0 ? "No Kroger pricing data yet." : "All items align with Kroger 30-day median."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Inventory avg</TableHead>
                    <TableHead>Kroger 30d median</TableHead>
                    <TableHead>Samples</TableHead>
                    <TableHead>Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedSignals.map((s) => {
                    const f = FLAG_LABEL[s.flag];
                    return (
                      <TableRow key={s.inventory_item_id}>
                        <TableCell className="font-medium">{s.inventory_name} <span className="text-muted-foreground text-xs">/ {s.inventory_unit}</span></TableCell>
                        <TableCell>${Number(s.inventory_avg ?? 0).toFixed(2)}</TableCell>
                        <TableCell>{s.kroger_30d_median != null ? `$${Number(s.kroger_30d_median).toFixed(2)}` : "—"}</TableCell>
                        <TableCell>{s.kroger_sample_count}</TableCell>
                        <TableCell><Badge variant={f.variant}>{f.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SKU mapping</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : skuRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SKUs ingested yet. Once ingest runs, unmapped SKUs will appear here for confirmation.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell>{r.product_name ?? "—"}</TableCell>
                      <TableCell><Badge variant={r.status === "confirmed" ? "secondary" : r.status === "unmapped" ? "outline" : "default"}>{r.status}</Badge></TableCell>
                      <TableCell>{r.match_confidence != null ? `${Math.round(Number(r.match_confidence) * 100)}%` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.last_seen_at).toLocaleDateString()}</TableCell>
                    </TableRow>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
