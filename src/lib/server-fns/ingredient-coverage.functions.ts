import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Deterministic ingredient coverage indicators.
 * - Global: % of recipe_ingredients rows linked to ingredient_reference
 * - Quote-level: % for a specific quote's recipes
 * - National: % of ingredient_reference rows with an active national snapshot
 */

export const getGlobalIngredientCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { count: total } = await sb
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true });
    const { count: linked } = await sb
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true })
      .not("reference_id", "is", null);
    const t = total ?? 0;
    const l = linked ?? 0;
    return { total: t, linked: l, pct: t > 0 ? Math.round((l / t) * 1000) / 10 : 100 };
  });

export const getQuoteIngredientCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quote_id: string }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: items } = await sb
      .from("quote_items")
      .select("recipe_id")
      .eq("quote_id", data.quote_id)
      .not("recipe_id", "is", null);

    const recipeIds = Array.from(
      new Set((items ?? []).map((r: any) => r.recipe_id).filter(Boolean)),
    );
    if (recipeIds.length === 0) {
      return { total: 0, linked: 0, pct: 100, missing: [] as { id: string; name: string; recipe_id: string }[] };
    }

    const { data: ings } = await sb
      .from("recipe_ingredients")
      .select("id,name,recipe_id,reference_id")
      .in("recipe_id", recipeIds);

    const all = ings ?? [];
    const missing = all.filter((r: any) => !r.reference_id);
    const total = all.length;
    const linked = total - missing.length;
    return {
      total,
      linked,
      pct: total > 0 ? Math.round((linked / total) * 1000) / 10 : 100,
      missing: missing.map((r: any) => ({ id: r.id, name: r.name, recipe_id: r.recipe_id })),
    };
  });

export const getNationalPriceCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: kv } = await sb.from("app_kv").select("value").eq("key", "active_national_price_month").maybeSingle();
    const month = kv?.value ?? null;
    const { count: refTotal } = await sb
      .from("ingredient_reference")
      .select("id", { count: "exact", head: true });
    let covered = 0;
    if (month) {
      const { data: snaps } = await sb
        .from("national_price_snapshots")
        .select("ingredient_id")
        .eq("month", month);
      covered = new Set((snaps ?? []).map((s: any) => s.ingredient_id)).size;
    }
    const t = refTotal ?? 0;
    return {
      activeMonth: month,
      total: t,
      covered,
      pct: t > 0 ? Math.round((covered / t) * 1000) / 10 : 0,
    };
  });
