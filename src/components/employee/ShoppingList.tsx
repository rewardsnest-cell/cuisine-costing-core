import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Truck, ShoppingCart, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useActiveSales } from "@/lib/use-active-sales";

type Row = {
  name: string;
  unit: string;
  needed: number;
  inStock: number;
  toBuy: number;
  inventoryItemId: string | null;
  unitCost: number;
  supplierId: string | null;
  supplierName: string;
  // sale info (when a cheaper active sale exists)
  onSale?: boolean;
  salePrice?: number | null;
  regularPrice?: number | null;
  packSize?: string | null;
  saleEndDate?: string | null;
  originalSupplierName?: string;
  savingsPerUnit?: number;
  totalSavings?: number;
};

type Group = {
  supplierId: string | null;
  supplierName: string;
  rows: Row[];
  estCost: number;
};

export function ShoppingList({ quoteId }: { quoteId: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingPOs, setCreatingPOs] = useState(false);
  const navigate = useNavigate();
  const { byItemId: activeSales } = useActiveSales();

  const createPurchaseOrders = async () => {
    const eligible = groups.filter((g) => g.supplierId && g.rows.some((r) => r.toBuy > 0 && r.inventoryItemId));
    if (eligible.length === 0) {
      toast.error("No items with linked suppliers and inventory to order.");
      return;
    }
    setCreatingPOs(true);
    try {
      let createdCount = 0;
      for (const g of eligible) {
        const items = g.rows.filter((r) => r.toBuy > 0 && r.inventoryItemId);
        if (items.length === 0) continue;
        const total = items.reduce((s, r) => s + r.toBuy * r.unitCost, 0);
        const { data: po, error: poErr } = await (supabase as any)
          .from("purchase_orders")
          .insert({
            supplier_id: g.supplierId,
            status: "draft",
            total_amount: total,
            notes: `Generated from shopping list for quote ${quoteId.slice(0, 8)}`,
          })
          .select("id")
          .single();
        if (poErr || !po) throw poErr || new Error("Failed to create PO");
        const poItems = items.map((r) => ({
          purchase_order_id: po.id,
          inventory_item_id: r.inventoryItemId,
          name: r.name,
          quantity: r.toBuy,
          unit: r.unit,
          unit_price: r.unitCost,
          total_price: r.toBuy * r.unitCost,
        }));
        const { error: itemsErr } = await (supabase as any).from("purchase_order_items").insert(poItems);
        if (itemsErr) throw itemsErr;
        createdCount++;
      }
      toast.success(`Created ${createdCount} draft purchase order${createdCount === 1 ? "" : "s"}.`);
      navigate({ to: "/admin/purchase-orders" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to create purchase orders");
    } finally {
      setCreatingPOs(false);
    }
  };

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

      // Fetch inventory item details (stock, cost, supplier)
      const invIds = Array.from(agg.values())
        .map((r) => r.inventoryItemId)
        .filter((x): x is string => !!x);
      const invMap = new Map<
        string,
        { current_stock: number; average_cost_per_unit: number; supplier_id: string | null }
      >();
      const supplierIds = new Set<string>();
      if (invIds.length) {
        const { data: inv } = await (supabase as any)
          .from("inventory_items")
          .select("id, current_stock, average_cost_per_unit, supplier_id")
          .in("id", invIds);
        for (const i of inv || []) {
          invMap.set(i.id, {
            current_stock: Number(i.current_stock) || 0,
            average_cost_per_unit: Number(i.average_cost_per_unit) || 0,
            supplier_id: i.supplier_id || null,
          });
          if (i.supplier_id) supplierIds.add(i.supplier_id);
        }
      }

      // Collect supplier IDs from active sales too, so we can show their names
      const saleSupplierIds = new Set<string>();
      for (const r of agg.values()) {
        if (!r.inventoryItemId) continue;
        const sale = activeSales[r.inventoryItemId];
        if (sale?.supplier_id) saleSupplierIds.add(sale.supplier_id);
      }
      const allSupIds = new Set<string>([...supplierIds, ...saleSupplierIds]);

      const supMap = new Map<string, string>();
      if (allSupIds.size) {
        const { data: sups } = await (supabase as any)
          .from("suppliers")
          .select("id, name")
          .in("id", Array.from(allSupIds));
        for (const s of sups || []) supMap.set(s.id, s.name);
      }

      const allRows: Row[] = Array.from(agg.values()).map((r) => {
        const inv = r.inventoryItemId ? invMap.get(r.inventoryItemId) : undefined;
        const inStock = inv?.current_stock || 0;
        const toBuy = Math.max(0, r.needed - inStock);
        const origSupplierId = inv?.supplier_id || null;
        const origSupplierName = origSupplierId
          ? supMap.get(origSupplierId) || "Unknown supplier"
          : "Unassigned";
        const avgCost = inv?.average_cost_per_unit || 0;

        // Check for active sale that beats current avg cost
        const sale = r.inventoryItemId ? activeSales[r.inventoryItemId] : undefined;
        const saleBeats =
          sale && sale.sale_price != null && (avgCost === 0 || sale.sale_price < avgCost);

        if (saleBeats && sale) {
          const saleSupId = sale.supplier_id || origSupplierId;
          const saleSupName = saleSupId
            ? supMap.get(saleSupId) || sale.supplier_name || "Unknown supplier"
            : sale.supplier_name || "Unassigned";
          const savingsPerUnit = avgCost > 0 ? avgCost - sale.sale_price! : 0;
          return {
            name: r.name,
            unit: r.unit,
            needed: r.needed,
            inStock,
            toBuy,
            inventoryItemId: r.inventoryItemId,
            unitCost: sale.sale_price!,
            supplierId: saleSupId,
            supplierName: saleSupName,
            onSale: true,
            salePrice: sale.sale_price,
            regularPrice: sale.regular_price ?? avgCost ?? null,
            packSize: sale.pack_size ?? null,
            saleEndDate: sale.sale_end_date ?? null,
            originalSupplierName: origSupplierName,
            savingsPerUnit,
            totalSavings: savingsPerUnit * toBuy,
          };
        }

        return {
          name: r.name,
          unit: r.unit,
          needed: r.needed,
          inStock,
          toBuy,
          inventoryItemId: r.inventoryItemId,
          unitCost: avgCost,
          supplierId: origSupplierId,
          supplierName: origSupplierName,
        };
      });

      // Group by supplier
      const grpMap = new Map<string, Group>();
      for (const r of allRows) {
        const key = r.supplierId || "__none__";
        const g = grpMap.get(key) || {
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          rows: [],
          estCost: 0,
        };
        g.rows.push(r);
        g.estCost += r.toBuy * r.unitCost;
        grpMap.set(key, g);
      }

      const out = Array.from(grpMap.values())
        .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => {
          // Real suppliers first, "Unassigned" last
          if (a.supplierId && !b.supplierId) return -1;
          if (!a.supplierId && b.supplierId) return 1;
          return a.supplierName.localeCompare(b.supplierName);
        });

      setGroups(out);
      setLoading(false);
    })();
  }, [quoteId, activeSales]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const fmt = (n: number) => n.toFixed(n < 1 && n > 0 ? 2 : 1);
  const grandTotal = groups.reduce((s, g) => s + g.estCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          Grouped by supplier. Costs use the linked inventory item's average cost.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            Estimated total:{" "}
            <span className="font-display font-bold text-primary">${grandTotal.toFixed(2)}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          <Button
            size="sm"
            onClick={createPurchaseOrders}
            disabled={creatingPOs || groups.length === 0}
            className="gap-2"
          >
            {creatingPOs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            Create POs
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No ingredients found. Menu items must be linked to recipes with ingredients.
        </p>
      ) : (
        groups.map((g) => (
          <div
            key={g.supplierId || "none"}
            className="border border-border/50 rounded-lg overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 border-b border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate">{g.supplierName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ({g.rows.length} item{g.rows.length === 1 ? "" : "s"})
                </span>
              </div>
              <span className="text-sm font-display font-bold shrink-0">
                ${g.estCost.toFixed(2)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-background">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Ingredient</th>
                  <th className="py-2 px-3 font-medium text-right">Needed</th>
                  <th className="py-2 px-3 font-medium text-right">In stock</th>
                  <th className="py-2 px-3 font-medium text-right">To buy</th>
                  <th className="py-2 px-3 font-medium">Unit</th>
                  <th className="py-2 px-3 font-medium text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => {
                  const covered = r.toBuy === 0 && r.needed > 0;
                  const lineCost = r.toBuy * r.unitCost;
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
                          covered ? "text-success" : ""
                        }`}
                      >
                        {covered ? "✓" : fmt(r.toBuy)}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{r.unit}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {lineCost > 0 ? `$${lineCost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
