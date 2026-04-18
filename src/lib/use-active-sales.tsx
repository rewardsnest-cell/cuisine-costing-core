import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tag } from "lucide-react";

export type ActiveSale = {
  inventory_item_id: string;
  sale_price: number | null;
  regular_price: number | null;
  pack_size: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  sale_end_date: string | null;
};

/**
 * Returns a map of inventory_item_id → cheapest active sale across all
 * processed, in-date sale flyers.
 */
export function useActiveSales() {
  const [byItemId, setByItemId] = useState<Record<string, ActiveSale>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("sale_flyer_items")
        .select(
          "inventory_item_id, sale_price, regular_price, pack_size, sale_flyers!inner(status, sale_start_date, sale_end_date, supplier_id, suppliers(name))"
        )
        .not("inventory_item_id", "is", null);

      if (cancelled) return;
      const map: Record<string, ActiveSale> = {};
      for (const row of (data || []) as any[]) {
        const flyer = row.sale_flyers;
        if (!flyer || flyer.status !== "processed") continue;
        if (flyer.sale_start_date && flyer.sale_start_date > today) continue;
        if (flyer.sale_end_date && flyer.sale_end_date < today) continue;
        const itemId = row.inventory_item_id as string;
        const price = row.sale_price != null ? Number(row.sale_price) : null;
        if (price == null) continue;
        const existing = map[itemId];
        if (!existing || (existing.sale_price != null && price < existing.sale_price)) {
          map[itemId] = {
            inventory_item_id: itemId,
            sale_price: price,
            regular_price: row.regular_price != null ? Number(row.regular_price) : null,
            pack_size: row.pack_size ?? null,
            supplier_id: flyer.supplier_id ?? null,
            supplier_name: flyer.suppliers?.name ?? null,
            sale_end_date: flyer.sale_end_date ?? null,
          };
        }
      }
      setByItemId(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { byItemId, loading };
}

export function SaleBadge({ sale, compact = false }: { sale: ActiveSale; compact?: boolean }) {
  const savings =
    sale.regular_price && sale.sale_price && sale.regular_price > sale.sale_price
      ? Math.round(((sale.regular_price - sale.sale_price) / sale.regular_price) * 100)
      : null;
  const tooltip = [
    sale.supplier_name && `Supplier: ${sale.supplier_name}`,
    sale.pack_size && `Pack: ${sale.pack_size}`,
    sale.regular_price != null && `Reg: $${sale.regular_price.toFixed(2)}`,
    sale.sale_end_date && `Ends: ${sale.sale_end_date}`,
  ].filter(Boolean).join(" • ");

  return (
    <span
      title={tooltip || undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-warm border border-gold/30"
    >
      <Tag className="w-3 h-3" />
      ${sale.sale_price?.toFixed(2)}
      {!compact && savings != null && <span className="opacity-70">−{savings}%</span>}
      {!compact && sale.supplier_name && (
        <span className="opacity-70 font-normal hidden sm:inline">@ {sale.supplier_name}</span>
      )}
    </span>
  );
}
