import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Link2Off, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Health {
  total_active_recipes: number;
  recipes_servings_one: number;
  recipes_zero_cost: number;
  total_ingredients: number;
  unlinked_ingredients: number;
  inventory_items_count: number;
  last_receipt_date: string | null;
}

export function CostHealthWidget() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows, error } = await (supabase as any)
        .from("cost_health_summary")
        .select("*")
        .maybeSingle();
      if (!error && rows) setData(rows as Health);
      setLoading(false);
    })();
  }, []);

  const linkedPct = data && data.total_ingredients > 0
    ? Math.round(((data.total_ingredients - data.unlinked_ingredients) / data.total_ingredients) * 100)
    : 0;

  const healthScore = !data ? 0 : Math.round(
    (linkedPct * 0.5) +
    ((1 - data.recipes_servings_one / Math.max(1, data.total_active_recipes)) * 30) +
    ((1 - data.recipes_zero_cost / Math.max(1, data.total_active_recipes)) * 20)
  );

  const scoreColor = healthScore >= 85 ? "text-success" : healthScore >= 60 ? "text-warning" : "text-destructive";
  const scoreBg = healthScore >= 85 ? "bg-success/10" : healthScore >= 60 ? "bg-warning/10" : "bg-destructive/10";

  return (
    <Card className="shadow-warm border-border/50">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">Cost Health</h3>
          </div>
          {data && (
            <div className={`px-3 py-1 rounded-full text-xs font-bold font-display ${scoreBg} ${scoreColor}`}>
              {healthScore}/100
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !data ? (
          <p className="text-muted-foreground text-sm">No data available.</p>
        ) : (
          <div className="space-y-3">
            <Link
              to="/admin/synonyms"
              className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Link2Off className={`w-4 h-4 ${data.unlinked_ingredients > 0 ? "text-warning" : "text-success"}`} />
                <span className="text-sm">Ingredients linked to inventory</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {linkedPct}% <span className="text-xs text-muted-foreground">({data.unlinked_ingredients} unlinked)</span>
              </span>
            </Link>

            <Link
              to="/admin/servings-review"
              className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className={`w-4 h-4 ${data.recipes_servings_one > 0 ? "text-warning" : "text-success"}`} />
                <span className="text-sm">Recipes with servings = 1</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {data.recipes_servings_one}<span className="text-xs text-muted-foreground">/{data.total_active_recipes}</span>
              </span>
            </Link>

            <Link
              to="/admin/recipes"
              className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {data.recipes_zero_cost === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm">Recipes with $0 cost</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{data.recipes_zero_cost}</span>
            </Link>

            <div className="flex items-center justify-between py-2 px-3 -mx-3">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Last receipt processed</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {data.last_receipt_date
                  ? new Date(data.last_receipt_date).toLocaleDateString()
                  : "—"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
