import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

async function getKey(sb: any) {
  const { data } = await sb.from("app_kv").select("value").eq("key", "fred_api_key_override").maybeSingle();
  if (data?.value) return String(data.value).trim();
  const env = process.env.FRED_API_KEY;
  if (!env) throw new Error("FRED_API_KEY not configured");
  return env;
}

async function requireAdmin(sb: any) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin access required");
  return user.id as string;
}

/**
 * Refresh inventory costs for a given set of recipes from the latest FRED observations,
 * for any inventory item linked to a `fred_series_map` entry via `ingredient_reference.fred_series_id`
 * or via keyword match on inventory name. Recomputes recipe costs at the end.
 */
export const bulkRefreshRecipesFromFred = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { recipe_ids: string[] }) => {
    if (!data || !Array.isArray(data.recipe_ids)) throw new Error("recipe_ids array required");
    if (data.recipe_ids.length === 0) throw new Error("recipe_ids is empty");
    if (data.recipe_ids.length > 500) throw new Error("too many recipes (max 500)");
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);
    const apiKey = await getKey(sb);

    // 1. Find inventory items used by these recipes
    const { data: ingRows, error: ingErr } = await sb
      .from("recipe_ingredients")
      .select("inventory_item_id")
      .in("recipe_id", data.recipe_ids)
      .not("inventory_item_id", "is", null);
    if (ingErr) throw new Error(ingErr.message);
    const itemIds = Array.from(new Set((ingRows || []).map((r: any) => r.inventory_item_id).filter(Boolean)));
    if (itemIds.length === 0) {
      return { items_refreshed: 0, recipes_recomputed: 0, errors: [] as { item: string; error: string }[] };
    }

    // 2. Map each item to a FRED series (via ingredient_reference.fred_series_id, then via keyword)
    const [{ data: refs }, { data: items }, { data: series }] = await Promise.all([
      sb.from("ingredient_reference").select("inventory_item_id, fred_series_id").in("inventory_item_id", itemIds),
      sb.from("inventory_items").select("id, name, average_cost_per_unit").in("id", itemIds),
      sb.from("fred_series_map").select("series_id, label, match_keywords, unit_conversion").eq("active", true),
    ]);

    const seriesById = new Map<string, any>((series || []).map((s: any) => [s.series_id, s]));
    const refsByItem = new Map<string, any>((refs || []).map((r: any) => [r.inventory_item_id, r]));
    const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    function pickSeriesFor(item: { id: string; name: string }) {
      const ref = refsByItem.get(item.id);
      if (ref?.fred_series_id && seriesById.has(ref.fred_series_id)) return seriesById.get(ref.fred_series_id);
      const itemNorm = norm(item.name);
      for (const s of (series || []) as any[]) {
        for (const kw of (s.match_keywords || [])) {
          const k = norm(kw);
          if (k && (itemNorm === k || itemNorm.split(" ").includes(k))) return s;
        }
      }
      return null;
    }

    const errors: { item: string; error: string }[] = [];
    let refreshed = 0;
    const cache = new Map<string, { date: string; value: number } | null>();

    for (const item of (items || []) as any[]) {
      const s = pickSeriesFor(item);
      if (!s) continue;
      try {
        if (!cache.has(s.series_id)) {
          const url = `${FRED_BASE}?series_id=${encodeURIComponent(s.series_id)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`FRED ${s.series_id} HTTP ${res.status}`);
          const json: any = await res.json();
          const obs = json?.observations?.[0];
          if (!obs || obs.value === ".") {
            cache.set(s.series_id, null);
          } else {
            const value = Number(obs.value);
            cache.set(s.series_id, isFinite(value) ? { date: obs.date, value } : null);
          }
        }
        const obs = cache.get(s.series_id);
        if (!obs) continue;
        const fredValue = obs.value * (s.unit_conversion || 1);
        const { error: updErr } = await sb
          .from("inventory_items")
          .update({ average_cost_per_unit: fredValue, last_receipt_cost: fredValue })
          .eq("id", item.id);
        if (updErr) throw new Error(updErr.message);
        await sb.from("price_history").insert({
          inventory_item_id: item.id,
          unit_price: fredValue,
          unit: null,
          source: "fred",
          observed_at: new Date(obs.date).toISOString(),
          notes: `Bulk FRED refresh ${s.series_id}`,
        });
        refreshed += 1;
      } catch (e: any) {
        errors.push({ item: item.name, error: e?.message || "unknown" });
      }
    }

    // 3. Recompute affected recipes
    let recipesRecomputed = 0;
    for (const rid of data.recipe_ids) {
      const { error } = await sb.rpc("recompute_recipe_cost", { _recipe_id: rid });
      if (!error) recipesRecomputed += 1;
    }

    return { items_refreshed: refreshed, recipes_recomputed: recipesRecomputed, errors };
  });
