import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { previewFredPull, applyFredPull } from "@/lib/server-fns/fred-pricing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, RefreshCw, CheckCircle2, AlertCircle, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { toast } from "sonner";

type PreviewRow = Awaited<ReturnType<typeof previewFredPull>>["preview"][number];

type RowDecision = {
  action: "apply" | "create" | "skip";
  inventory_item_id?: string;
  new_name?: string;
  new_unit?: string;
};

const COMMON_UNITS = ["each", "lb", "oz", "gallon", "dozen", "kg", "g", "ml", "l", "cup", "bunch", "head", "package"];

interface Props {
  /** Optional callback after a successful apply, useful when the parent wants to refresh other data. */
  onApplied?: () => void;
}

export function FredPullPanel({ onApplied }: Props) {
  const previewFn = useServerFn(previewFredPull);
  const applyFn = useServerFn(applyFredPull);

  const [pulling, setPulling] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pullResult, setPullResult] = useState<Awaited<ReturnType<typeof previewFredPull>> | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [error, setError] = useState<string | null>(null);

  const handlePull = async () => {
    setError(null);
    setPulling(true);
    setPullResult(null);
    setDecisions({});
    try {
      const res = await previewFn({ data: { only_active: true } });
      setPullResult(res);

      // Default decisions: apply if matched, create if not
      const initial: Record<string, RowDecision> = {};
      for (const row of res.preview) {
        initial[row.series_id] = row.match
          ? { action: "apply", inventory_item_id: row.match.inventory_item_id }
          : { action: "skip", new_name: row.suggested_inventory_name, new_unit: row.unit };
      }
      setDecisions(initial);
      toast.success(`Pulled ${res.preview.length} series from FRED`);
      if (res.errors.length) toast.warning(`${res.errors.length} series failed to fetch — see details below`);
    } catch (e: any) {
      setError(e?.message || "FRED pull failed");
      toast.error(e?.message || "FRED pull failed");
    } finally {
      setPulling(false);
    }
  };

  const setDecision = (seriesId: string, patch: Partial<RowDecision>) => {
    setDecisions((prev) => ({ ...prev, [seriesId]: { ...(prev[seriesId] || { action: "skip" }), ...patch } }));
  };

  const summary = useMemo(() => {
    let apply = 0, create = 0, skip = 0, recipes = 0;
    if (!pullResult) return { apply, create, skip, recipes };
    for (const row of pullResult.preview) {
      const d = decisions[row.series_id];
      if (!d) continue;
      if (d.action === "apply") { apply += 1; recipes += row.affected_recipes; }
      else if (d.action === "create") create += 1;
      else skip += 1;
    }
    return { apply, create, skip, recipes };
  }, [pullResult, decisions]);

  const handleApply = async () => {
    if (!pullResult) return;
    setApplying(true);
    try {
      const actions = pullResult.preview
        .map((row) => {
          const d = decisions[row.series_id];
          if (!d || d.action === "skip") return null;
          return {
            series_id: row.series_id,
            action: d.action,
            inventory_item_id: d.action === "apply" ? d.inventory_item_id : undefined,
            new_name: d.action === "create" ? (d.new_name || row.suggested_inventory_name) : undefined,
            new_unit: d.action === "create" ? (d.new_unit || row.unit) : undefined,
            observation_value: row.observation_value,
            observation_date: row.observation_date,
            unit: row.unit,
            label: row.label,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (actions.length === 0) {
        toast.info("Nothing selected to apply");
        setApplying(false);
        return;
      }

      const res = await applyFn({ data: { actions } });
      const parts: string[] = [];
      if (res.applied) parts.push(`${res.applied} cost${res.applied === 1 ? "" : "s"} updated`);
      if (res.created) parts.push(`${res.created} new ingredient${res.created === 1 ? "" : "s"}`);
      if (res.recipes_recomputed) parts.push(`${res.recipes_recomputed} recipe${res.recipes_recomputed === 1 ? "" : "s"} recosted`);
      toast.success(parts.length ? `FRED applied — ${parts.join(", ")}` : "FRED applied");
      if (res.errors.length) toast.warning(`${res.errors.length} row${res.errors.length === 1 ? "" : "s"} failed`);

      // Clear preview after successful apply
      setPullResult(null);
      setDecisions({});
      onApplied?.();
    } catch (e: any) {
      toast.error(e?.message || "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" /> FRED Pricing (Federal Reserve / BLS)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pull the latest BLS-mirrored grocery prices from the Federal Reserve. Review every change before applying — costs flow into recipes automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handlePull}
            disabled={pulling || applying}
            size="lg"
            className="bg-gradient-warm text-primary-foreground gap-2"
          >
            {pulling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {pulling ? "Pulling…" : "Pull Latest from FRED"}
          </Button>
          {pullResult && (
            <p className="text-xs text-muted-foreground">
              {pullResult.preview.length} series · {pullResult.preview.filter((r) => r.match).length} matched ·{" "}
              {pullResult.errors.length} errors
            </p>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pullResult && pullResult.preview.length > 0 && (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Ingredient (FRED label)</th>
                      <th className="text-right px-3 py-2">Current</th>
                      <th className="text-right px-3 py-2">FRED</th>
                      <th className="text-right px-3 py-2">Δ</th>
                      <th className="text-left px-3 py-2 w-[280px]">Action</th>
                      <th className="text-right px-3 py-2">Recipes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pullResult.preview.map((row) => {
                      const d = decisions[row.series_id] || { action: "skip" };
                      const pct = row.pct_change;
                      const trendIcon = pct == null ? <Minus className="w-3 h-3" /> :
                        pct > 1 ? <TrendingUp className="w-3 h-3 text-warning" /> :
                        pct < -1 ? <TrendingDown className="w-3 h-3 text-success" /> :
                        <Minus className="w-3 h-3 text-muted-foreground" />;
                      return (
                        <tr key={row.series_id} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <div className="font-medium">{row.label}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {row.series_id} · {row.observation_date} · {row.unit}
                              {row.match && (
                                <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1.5">
                                  → {row.match.inventory_name}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.match ? `$${row.match.current_unit_cost.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            ${row.observation_value.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {pct == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                {trendIcon}
                                {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={d.action}
                              onValueChange={(v) => setDecision(row.series_id, { action: v as RowDecision["action"] })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {row.match && <SelectItem value="apply">Apply to {row.match.inventory_name}</SelectItem>}
                                <SelectItem value="create">Create new inventory item</SelectItem>
                                <SelectItem value="skip">Skip</SelectItem>
                              </SelectContent>
                            </Select>
                            {d.action === "create" && (
                              <div className="mt-1.5 grid grid-cols-[1fr_90px] gap-1.5">
                                <Input
                                  className="h-7 text-xs"
                                  placeholder="Item name"
                                  value={d.new_name ?? row.suggested_inventory_name}
                                  onChange={(e) => setDecision(row.series_id, { new_name: e.target.value })}
                                />
                                <Select
                                  value={d.new_unit ?? row.unit}
                                  onValueChange={(v) => setDecision(row.series_id, { new_unit: v })}
                                >
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {COMMON_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                            {row.affected_recipes || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{summary.apply}</span> apply ·{" "}
                <span className="text-foreground font-medium">{summary.create}</span> create ·{" "}
                <span className="text-foreground font-medium">{summary.skip}</span> skip
                {summary.recipes > 0 && (
                  <span className="ml-2 text-primary">— affects {summary.recipes} recipe{summary.recipes === 1 ? "" : "s"}</span>
                )}
              </div>
              <Button
                onClick={handleApply}
                disabled={applying || summary.apply + summary.create === 0}
                className="bg-gradient-warm text-primary-foreground gap-2"
              >
                {applying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Apply {summary.apply + summary.create} change{summary.apply + summary.create === 1 ? "" : "s"}
              </Button>
            </div>

            {pullResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">{pullResult.errors.length} series failed:</div>
                  <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                    {pullResult.errors.map((e) => (
                      <li key={e.series_id}><code>{e.series_id}</code>: {e.error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {pullResult && pullResult.preview.length === 0 && (
          <p className="text-sm text-muted-foreground">No FRED series returned data. Add series in the admin or check the API key.</p>
        )}
      </CardContent>
    </Card>
  );
}
