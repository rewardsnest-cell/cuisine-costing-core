import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

type Row = { name: string; unit: string; quantity: number };

export function ShoppingList({ quoteId }: { quoteId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Get quote items with linked recipes
      const { data: items } = await (supabase as any)
        .from("quote_items")
        .select("quantity, recipe_id, recipes(id, servings, recipe_ingredients(name, unit, quantity))")
        .eq("quote_id", quoteId);

      const agg = new Map<string, Row>();
      for (const item of items || []) {
        const recipe = item.recipes;
        if (!recipe) continue;
        const servings = Number(recipe.servings) || 1;
        const scale = Number(item.quantity) / servings;
        for (const ing of recipe.recipe_ingredients || []) {
          const key = `${ing.name.toLowerCase()}|${ing.unit}`;
          const prev = agg.get(key);
          const qty = Number(ing.quantity) * scale;
          if (prev) prev.quantity += qty;
          else agg.set(key, { name: ing.name, unit: ing.unit, quantity: qty });
        }
      }
      setRows(Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    })();
  }, [quoteId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Aggregated from menu items (recipe ingredients × portions).
        </p>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-2">
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No ingredients found. Menu items must be linked to recipes with ingredients.
        </p>
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="py-2 px-3 font-medium">Ingredient</th>
                <th className="py-2 px-3 font-medium text-right">Quantity</th>
                <th className="py-2 px-3 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.name}-${r.unit}`} className="border-t border-border/40">
                  <td className="py-2 px-3">{r.name}</td>
                  <td className="py-2 px-3 text-right font-mono">
                    {r.quantity.toFixed(r.quantity < 1 ? 2 : 1)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
