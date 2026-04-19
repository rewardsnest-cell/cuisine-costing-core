import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { convertQty } from "@/lib/recipe-costing";

/**
 * Margin-safe quote re-pricing.
 *
 * For each ingredient on every recipe in the quote, we compute an effective
 * unit cost as MAX( national_price_snapshot, recent local average ) and
 * recompute recipe cost-per-serving + quote item prices from that.
 *
 * Read-only with respect to all source tables: only writes to quote_items
 * and quotes (subtotal/total). Does NOT touch inventory_items, price_history,
 * recipes.total_cost, or actual purchase costs.
 */
export const applyNationalFloorPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { quoteId: string; month?: string }) => {
    if (!data?.quoteId) throw new Error("quoteId is required");
    if (data.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)) {
      throw new Error("month must be YYYY-MM");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const month = data.month || new Date().toISOString().slice(0, 7);

    const { data: settings } = await sb
      .from("app_settings")
      .select("markup_multiplier")
      .eq("id", 1)
      .maybeSingle();
    const markup = Number(settings?.markup_multiplier) || 3.0;

    const { data: items, error: itemsErr } = await sb
      .from("quote_items")
      .select("id, quantity, recipe_id")
      .eq("quote_id", data.quoteId);
    if (itemsErr) throw itemsErr;

    const recipeIds = Array.from(
      new Set((items ?? []).map((i) => i.recipe_id).filter((x): x is string => !!x)),
    );

    // Load all ingredients for these recipes in one shot.
    const { data: ingRows } = recipeIds.length
      ? await sb
          .from("recipe_ingredients")
          .select(
            "recipe_id, quantity, unit, cost_per_unit, inventory_item_id, reference_id, name",
          )
          .in("recipe_id", recipeIds)
      : { data: [] as any[] };

    const ingredients = ingRows ?? [];

    // Resolve reference_id where missing, by normalized name.
    const missingRefNames = Array.from(
      new Set(
        ingredients.filter((r: any) => !r.reference_id).map((r: any) => r.name),
      ),
    );
    const nameToRefId = new Map<string, string>();
    if (missingRefNames.length) {
      const { data: refs } = await sb
        .from("ingredient_reference")
        .select("id, canonical_name");
      // simple lower/trim match (DB has a normalize fn but we keep this client-side simple)
      for (const r of refs ?? []) {
        nameToRefId.set(((r as any).canonical_name || "").trim().toLowerCase(), (r as any).id);
      }
    }

    const referenceIds = Array.from(
      new Set(
        ingredients
          .map((r: any) =>
            r.reference_id ||
            nameToRefId.get(String(r.name || "").trim().toLowerCase()) ||
            null,
          )
          .filter((x): x is string => !!x),
      ),
    );

    // Snapshot lookup: latest snapshot for selected month per ingredient.
    const snapshotByRef = new Map<string, { price: number; unit: string }>();
    if (referenceIds.length) {
      const { data: snaps } = await sb
        .from("national_price_snapshots")
        .select("ingredient_id, price, unit, month")
        .in("ingredient_id", referenceIds)
        .lte("month", month)
        .order("month", { ascending: false });
      for (const s of (snaps as any[]) ?? []) {
        if (!snapshotByRef.has(s.ingredient_id)) {
          snapshotByRef.set(s.ingredient_id, {
            price: Number(s.price) || 0,
            unit: String(s.unit || ""),
          });
        }
      }
    }

    // Reference -> inventory link, density, waste
    const refMeta = new Map<
      string,
      { inventory_item_id: string | null; density_g_per_ml: number | null; waste_factor: number }
    >();
    if (referenceIds.length) {
      const { data: refs } = await sb
        .from("ingredient_reference")
        .select("id, inventory_item_id, density_g_per_ml, waste_factor")
        .in("id", referenceIds);
      for (const r of (refs as any[]) ?? []) {
        refMeta.set(r.id, {
          inventory_item_id: r.inventory_item_id ?? null,
          density_g_per_ml: r.density_g_per_ml ?? null,
          waste_factor: Number(r.waste_factor) || 1,
        });
      }
    }

    const inventoryIds = Array.from(
      new Set(
        [
          ...ingredients.map((r: any) => r.inventory_item_id).filter(Boolean),
          ...Array.from(refMeta.values())
            .map((m) => m.inventory_item_id)
            .filter(Boolean),
        ] as string[],
      ),
    );

    const invMap = new Map<string, { unit: string; average_cost_per_unit: number }>();
    if (inventoryIds.length) {
      const { data: invs } = await sb
        .from("inventory_items")
        .select("id, unit, average_cost_per_unit")
        .in("id", inventoryIds);
      for (const i of (invs as any[]) ?? []) {
        invMap.set(i.id, {
          unit: i.unit,
          average_cost_per_unit: Number(i.average_cost_per_unit) || 0,
        });
      }
    }

    // Compute per-recipe total cost using MAX(national, local).
    const recipeTotals = new Map<string, number>();
    for (const ing of ingredients) {
      const refId =
        (ing as any).reference_id ||
        nameToRefId.get(String((ing as any).name || "").trim().toLowerCase()) ||
        null;
      const snap = refId ? snapshotByRef.get(refId) : undefined;
      const meta = refId ? refMeta.get(refId) : undefined;
      const invId = meta?.inventory_item_id ?? (ing as any).inventory_item_id ?? null;
      const inv = invId ? invMap.get(invId) : undefined;

      const qty = Number((ing as any).quantity) || 0;
      const recipeUnit = String((ing as any).unit || "");
      const fallback = Number((ing as any).cost_per_unit) || 0;
      const waste = Math.max(meta?.waste_factor ?? 1, 0.01);

      // local cost (per recipe unit)
      let localUnitCost = 0;
      if (inv && inv.average_cost_per_unit > 0) {
        const factor = convertQty(1, recipeUnit, inv.unit);
        if (factor !== null) localUnitCost = factor * inv.average_cost_per_unit;
        else localUnitCost = fallback;
      } else {
        localUnitCost = fallback;
      }

      // national cost (per recipe unit, converted from snapshot unit)
      let nationalUnitCost = 0;
      if (snap && snap.price > 0 && snap.unit) {
        const factor = convertQty(1, recipeUnit, snap.unit);
        if (factor !== null) nationalUnitCost = factor * snap.price;
      }

      const effectiveUnitCost = Math.max(nationalUnitCost, localUnitCost);
      const lineCost = (qty * effectiveUnitCost) / waste;
      recipeTotals.set(
        (ing as any).recipe_id,
        (recipeTotals.get((ing as any).recipe_id) || 0) + lineCost,
      );
    }

    // Need servings for each recipe to derive cost-per-serving.
    const servingsByRecipe = new Map<string, number>();
    if (recipeIds.length) {
      const { data: rcps } = await sb
        .from("recipes")
        .select("id, servings")
        .in("id", recipeIds);
      for (const r of (rcps as any[]) ?? []) {
        servingsByRecipe.set(r.id, Math.max(Number(r.servings) || 1, 1));
      }
    }

    let updated = 0;
    for (const item of items ?? []) {
      if (!item.recipe_id) continue;
      const total = recipeTotals.get(item.recipe_id) || 0;
      const servings = servingsByRecipe.get(item.recipe_id) || 1;
      const cps = total / servings;
      const unit = Math.round(cps * markup * 100) / 100;
      const qty = Number(item.quantity) || 1;
      const lineTotal = Math.round(unit * qty * 100) / 100;
      const { error: upErr } = await sb
        .from("quote_items")
        .update({ unit_price: unit, total_price: lineTotal })
        .eq("id", item.id);
      if (upErr) throw upErr;
      updated += 1;
    }

    // Recompute quote subtotal/total (same per-guest rounding rule as recalcQuotePricing).
    const { data: refreshed } = await sb
      .from("quote_items")
      .select("total_price")
      .eq("quote_id", data.quoteId);
    const rawSubtotal = (refreshed ?? []).reduce(
      (s, r: any) => s + (Number(r.total_price) || 0),
      0,
    );
    const { data: quote } = await sb
      .from("quotes")
      .select("tax_rate, guest_count")
      .eq("id", data.quoteId)
      .maybeSingle();
    const taxRate = Number(quote?.tax_rate) || 0;
    const guests = Math.max(Number(quote?.guest_count) || 1, 1);
    const rawPerGuest = rawSubtotal / guests;
    const roundedPerGuest = rawPerGuest > 0 ? Math.ceil(rawPerGuest / 5) * 5 : 0;
    const subtotal = Math.round(roundedPerGuest * guests * 100) / 100;
    const total = Math.round(subtotal * (1 + taxRate) * 100) / 100;
    const { error: qErr } = await sb
      .from("quotes")
      .update({ subtotal, total })
      .eq("id", data.quoteId);
    if (qErr) throw qErr;

    return {
      updatedItems: updated,
      subtotal,
      total,
      markup,
      perGuest: roundedPerGuest,
      month,
      nationalSnapshotsApplied: snapshotByRef.size,
    };
  });
