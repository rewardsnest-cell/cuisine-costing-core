import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, TrendingUp, TrendingDown, Sparkles, AlertCircle, ArrowRight } from "lucide-react";

type Pull = { id: string; pulled_at: string; series_count: number; matched_count: number; applied_count: number; created_count: number; errors: any };
type PriceRow = { inventory_item_id: string; unit_price: number; observed_at: string; source: string; inventory_items: { name: string; average_cost_per_unit: number } | null };
type NewItem = { id: string; name: string; unit: string; created_at: string; average_cost_per_unit: number };

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function PricingHealthWidget() {
  const [lastPull, setLastPull] = useState<Pull | null>(null);
  const [recentChanges, setRecentChanges] = useState<Array<{ name: string; from: number; to: number; pct: number; itemId: string }>>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [pullRes, priceRes, newRes] = await Promise.all([
        (supabase as any).from("fred_pull_log").select("*").order("pulled_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase as any)
          .from("price_history")
          .select("inventory_item_id, unit_price, observed_at, source, inventory_items(name, average_cost_per_unit)")
          .eq("source", "fred")
          .gte("observed_at", since)
          .order("observed_at", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("inventory_items")
          .select("id, name, unit, created_at, average_cost_per_unit")
          .eq("created_source", "fred")
          .eq("pending_review", true)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      setLastPull(pullRes.data as Pull | null);

      // Compute recent significant changes (>5%) by comparing each item's last two FRED prices
      const byItem = new Map<string, PriceRow[]>();
      for (const row of (priceRes.data || []) as PriceRow[]) {
        if (!row.inventory_item_id) continue;
        if (!byItem.has(row.inventory_item_id)) byItem.set(row.inventory_item_id, []);
        byItem.get(row.inventory_item_id)!.push(row);
      }
      const changes: Array<{ name: string; from: number; to: number; pct: number; itemId: string }> = [];
      for (const [itemId, rows] of byItem) {
        if (rows.length < 2) continue;
        const sorted = rows.sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime());
        const to = Number(sorted[0].unit_price);
        const from = Number(sorted[1].unit_price);
        if (!from || !to) continue;
        const pct = ((to - from) / from) * 100;
        if (Math.abs(pct) >= 5) {
          changes.push({ itemId, name: sorted[0].inventory_items?.name || "Unknown", from, to, pct });
        }
      }
      changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      setRecentChanges(changes.slice(0, 5));
      setNewItems((newRes.data || []) as NewItem[]);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <Card className="shadow-warm border-border/50">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">Pricing Health</h3>
          </div>
          <Link to="/admin/inventory" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            Pull from FRED <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* FRED status */}
          <div className="rounded-lg border border-border/50 p-4 bg-muted/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">FRED last pull</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : lastPull ? (
              <>
                <p className="font-semibold">{timeAgo(lastPull.pulled_at)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lastPull.applied_count} applied · {lastPull.created_count} created
                  {Array.isArray(lastPull.errors) && lastPull.errors.length > 0 && (
                    <span className="text-destructive ml-1">· {lastPull.errors.length} errors</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No pulls yet — click "Pull from FRED" to start.</p>
            )}
          </div>

          {/* Recent significant changes */}
          <div className="rounded-lg border border-border/50 p-4 bg-muted/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Significant changes (30d)</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recentChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No price moves &gt;5%.</p>
            ) : (
              <ul className="space-y-1.5">
                {recentChanges.map((c) => (
                  <li key={c.itemId} className="flex items-center justify-between text-xs gap-2">
                    <Link to="/admin/inventory" className="truncate flex-1 hover:text-primary">{c.name}</Link>
                    <span className={`tabular-nums inline-flex items-center gap-1 font-medium ${c.pct > 0 ? "text-warning" : "text-success"}`}>
                      {c.pct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {c.pct > 0 ? "+" : ""}{c.pct.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* New auto-created items */}
          <div className="rounded-lg border border-border/50 p-4 bg-muted/20">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">New ingredients (FRED)</p>
              {newItems.length > 0 && <Badge variant="outline" className="text-[9px]">review</Badge>}
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : newItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new items pending.</p>
            ) : (
              <ul className="space-y-1.5">
                {newItems.map((it) => (
                  <li key={it.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="truncate flex-1">{it.name}</span>
                    <span className="text-muted-foreground tabular-nums">${Number(it.average_cost_per_unit).toFixed(2)}/{it.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {newItems.length > 0 && (
          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-warning/5 border border-warning/20 rounded-md p-3">
            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              {newItems.length} ingredient{newItems.length === 1 ? "" : "s"} were auto-created from FRED — confirm units and supplier mapping.
            </div>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/admin/inventory">Review</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
