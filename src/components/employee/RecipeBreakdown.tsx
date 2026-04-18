import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, ChefHat } from "lucide-react";

type Ingredient = {
  name: string;
  unit: string;
  quantity: number;
  inventory_item_id: string | null;
};

type RecipeBlock = {
  quoteItemId: string;
  itemName: string;
  servingsOrdered: number;       // quote_items.quantity
  recipeServings: number;        // recipes.servings (per batch)
  scale: number;                 // servingsOrdered / recipeServings
  costPerServing: number;
  ingredients: Ingredient[];
};

export function RecipeBreakdown({ quoteId }: { quoteId: string }) {
  const [blocks, setBlocks] = useState<RecipeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("quote_items")
        .select(
          "id, name, quantity, recipes(id, name, servings, cost_per_serving, recipe_ingredients(name, unit, quantity, inventory_item_id))",
        )
        .eq("quote_id", quoteId);

      const out: RecipeBlock[] = [];
      for (const it of data ?? []) {
        const r = it.recipes;
        if (!r) continue;
        const rs = Number(r.servings) || 1;
        const ordered = Number(it.quantity) || 0;
        out.push({
          quoteItemId: it.id,
          itemName: r.name || it.name,
          servingsOrdered: ordered,
          recipeServings: rs,
          scale: ordered / rs,
          costPerServing: Number(r.cost_per_serving) || 0,
          ingredients: (r.recipe_ingredients ?? []).map((ing: any) => ({
            name: ing.name,
            unit: ing.unit,
            quantity: Number(ing.quantity) || 0,
            inventory_item_id: ing.inventory_item_id ?? null,
          })),
        });
      }
      setBlocks(out);
      // Default first block open
      if (out.length > 0) setOpen({ [out[0].quoteItemId]: true });
      setLoading(false);
    })();
  }, [quoteId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading recipes…</p>;
  if (blocks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No recipes linked yet. Line items must reference a recipe to show ingredients.
      </p>
    );
  }

  const fmt = (n: number) => (n < 1 && n > 0 ? n.toFixed(2) : n.toFixed(1));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Per-recipe ingredient breakdown. Quantities are scaled to the ordered servings.
      </p>
      {blocks.map((b) => {
        const isOpen = !!open[b.quoteItemId];
        return (
          <div key={b.quoteItemId} className="border border-border/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpen((s) => ({ ...s, [b.quoteItemId]: !isOpen }))}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <ChefHat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate">{b.itemName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ×{b.servingsOrdered} servings
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {b.ingredients.length} ingredient{b.ingredients.length === 1 ? "" : "s"}
                {b.costPerServing > 0 && (
                  <> · ${(b.costPerServing * b.servingsOrdered).toFixed(2)} cost</>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border/40">
                {b.ingredients.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic p-3">
                    No ingredients defined for this recipe.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-background">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 px-3 font-medium">Ingredient</th>
                        <th className="py-2 px-3 font-medium text-right">Per serving</th>
                        <th className="py-2 px-3 font-medium text-right">Total needed</th>
                        <th className="py-2 px-3 font-medium">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.ingredients.map((ing, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="py-2 px-3">
                            {ing.name}
                            {!ing.inventory_item_id && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                unlinked
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{fmt(ing.quantity)}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">
                            {fmt(ing.quantity * b.scale)}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{ing.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
