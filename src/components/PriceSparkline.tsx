import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Point = { observed_at: string; unit_price: number };

export function PriceSparkline({ inventoryItemId, width = 80, height = 24 }: { inventoryItemId: string; width?: number; height?: number }) {
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("price_history")
      .select("observed_at, unit_price")
      .eq("inventory_item_id", inventoryItemId)
      .order("observed_at", { ascending: true })
      .limit(30)
      .then(({ data }) => {
        if (cancelled) return;
        setPoints((data as Point[]) || []);
      });
    return () => { cancelled = true; };
  }, [inventoryItemId]);

  if (!points || points.length < 2) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }

  const prices = points.map((p) => Number(p.unit_price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = width / (prices.length - 1);
  const path = prices
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(height - ((p - min) / range) * height).toFixed(1)}`)
    .join(" ");

  const first = prices[0];
  const last = prices[prices.length - 1];
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = pct > 1;
  const down = pct < -1;
  const color = up ? "text-destructive" : down ? "text-success" : "text-muted-foreground";
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <div className="inline-flex items-center gap-1.5">
      <svg width={width} height={height} className={color}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-xs font-medium ${color} inline-flex items-center gap-0.5`}>
        <Icon className="w-3 h-3" />
        {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
      </span>
    </div>
  );
}
