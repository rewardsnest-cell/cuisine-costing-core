import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

type Row = {
  name: string;
  unit: string;
  needed: number;
  inStock: number;
  toBuy: number;
  inventoryItemId: string | null;
};

export function ShoppingList({ quoteId }: { quoteId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: items } = await (supabase as any)
        .from("quote_items")
        .select(
          "quantity, recipe_id, recipes(id, servings, recipe_ingredients(name, unit, quantity, inventory_item_id))",
        )
        .eq("quote_id", quoteId);

      type Agg = { name: string; unit: string; needed: number; inventoryItemId: string | null };
      const agg = new Map<string, Agg>();
      for (const item of items || []) {
        const recipe = item.recipes;
        if (!recipe) continue;
        const servings = Number(recipe.servings) || 1;
        const scale = Number(item.quantity) / servings;
        for (const ing of recipe.recipe_ingredients || []) {
          const key = ing.inventory_item_id
            ? `inv:${ing.inventory_item_id}|${ing.unit}`
            : `name:${ing.name.toLowerCase()}|${ing.unit}`;
          const qty = Number(ing.quantity) * scale;
          const prev = agg.get(key);
          if (prev) prev.needed += qty;
          else
            agg.set(key, {
              name: ing.name,
              unit: ing.unit,
              needed: qty,
              inventoryItemId: ing.inventory_item_id || null,
            });
        }
      }

      // Fetch current stock for linked inventory items
      const invIds = Array.from(agg.values())
        .map((r) => r.inventoryItemId)
        .filter((x): x is string => !!x);
      const stockMap = new Map<string, number>();
      if (invIds.length) {
        const { data: inv } = await (supabase as any)
          .from("inventory_items")
          .select("id, current_stock")
          .in("id", invIds);
        for (const i of inv || []) stockMap.set(i.id, Number(i.current_stock) || 0);
      }

      const out: Row[] = Array.from(agg.values())
        .map((r) => {
          const inStock = r.inventoryItemId ? stockMap.get(r.inventoryItemId) || 0 : 0;
          const toBuy = Math.max(0, r.needed - inStock);
          return { ...r, inStock, toBuy };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      setRows(out);
      setLoading(false);
    })();
  }, [quoteId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const fmt = (n: number) => n.toFixed(n < 1 && n > 0 ? 2 : 1);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Needed − In stock = To buy. Unlinked ingredients show 0 in stock.
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
                <th className="py-2 px-3 font-medium text-right">Needed</th>
                <th className="py-2 px-3 font-medium text-right">In stock</th>
                <th className="py-2 px-3 font-medium text-right">To buy</th>
                <th className="py-2 px-3 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const covered = r.toBuy === 0 && r.needed > 0;
                return (
                  <tr
                    key={i}
                    className={`border-t border-border/40 ${covered ? "bg-success/5" : ""}`}
                  >
                    <td className="py-2 px-3">
                      {r.name}
                      {!r.inventoryItemId && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          unlinked
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(r.needed)}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                      {fmt(r.inStock)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-semibold ${
                        covered ? "text-success" : r.toBuy > 0 ? "text-foreground" : ""
                      }`}
                    >
                      {covered ? "✓" : fmt(r.toBuy)}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{r.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
