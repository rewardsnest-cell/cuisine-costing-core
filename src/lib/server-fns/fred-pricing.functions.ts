import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * FRED (Federal Reserve Economic Data) pricing integration.
 *
 * Pulls the latest observation for each FRED series in `fred_series_map`,
 * matches it to existing inventory items (via reference, synonyms, or keywords),
 * and returns a preview the admin can review before applying.
 *
 * Apply step:
 *   - Updates inventory_items.average_cost_per_unit + last_receipt_cost
 *   - Records a row in price_history (source = 'fred')
 *   - Records a row in national_price_snapshots (append-only monthly)
 *   - Recomputes cost on every recipe that uses each updated item
 */

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

type Match = {
  inventory_item_id: string;
  inventory_name: string;
  current_unit_cost: number;
  match_score: number;
  match_source: "reference_override" | "synonym" | "name" | "keyword";
};

type FredRow = {
  series_id: string;
  label: string;
  unit: string;
  unit_conversion: number;
  category: string | null;
  observation_date: string; // YYYY-MM-DD
  observation_value: number;
  match: Match | null;
  pct_change: number | null;
  affected_recipes: number;
  // proposed canonical name to use if admin clicks "Create new"
  suggested_inventory_name: string;
};

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function getFredApiKey(sb: any): Promise<string> {
  // Prefer DB override, fall back to env secret.
  const { data } = await sb.from("app_kv").select("value").eq("key", "fred_api_key_override").maybeSingle();
  const dbKey = (data?.value || "").trim();
  if (dbKey) return dbKey;
  const env = process.env.FRED_API_KEY;
  if (!env) throw new Error("FRED_API_KEY is not configured. Add the secret or set fred_api_key_override in app_kv.");
  return env;
}

async function requireAdmin(sb: any) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin access required");
  return user.id as string;
}

async function fetchLatestObservation(seriesId: string, apiKey: string): Promise<{ date: string; value: number } | null> {
  const url = `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FRED ${seriesId} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const obs = (data?.observations || [])[0];
  if (!obs || obs.value === "." ) return null;
  const value = Number(obs.value);
  if (!Number.isFinite(value)) return null;
  return { date: obs.date, value };
}

/**
 * Pull latest from FRED. Read-only — returns a preview the admin can review.
 */
export const previewFredPull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { only_active?: boolean }) => ({
    only_active: data?.only_active !== false,
  }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);
    const apiKey = await getFredApiKey(sb);

    // Load FRED series map — primary first so they win when keywords overlap.
    let seriesQ = sb
      .from("fred_series_map")
      .select("series_id, label, match_keywords, unit, unit_conversion, category, active, priority")
      .order("priority", { ascending: true }); // 'fallback' > 'primary' alphabetically; reverse below
    if (data.only_active) seriesQ = seriesQ.eq("active", true);
    const { data: seriesRows, error: seriesErr } = await seriesQ;
    if (seriesErr) throw new Error(`Load FRED series: ${seriesErr.message}`);
    const series = ((seriesRows || []) as Array<{
      series_id: string; label: string; match_keywords: string[]; unit: string; unit_conversion: number; category: string | null; priority: "primary" | "fallback";
    }>).sort((a, b) => {
      // Primary before fallback
      if (a.priority === b.priority) return 0;
      return a.priority === "primary" ? -1 : 1;
    });

    // Load inventory + reference (with FRED override) + synonyms in parallel
    const [{ data: inv }, { data: refs }, { data: syns }] = await Promise.all([
      sb.from("inventory_items").select("id, name, unit, average_cost_per_unit"),
      sb.from("ingredient_reference").select("id, canonical_name, canonical_normalized, inventory_item_id, fred_series_id"),
      sb.from("ingredient_synonyms").select("alias_normalized, canonical, reference_id"),
    ]);

    const inventory = (inv || []) as Array<{ id: string; name: string; unit: string; average_cost_per_unit: number }>;
    const references = (refs || []) as Array<{ id: string; canonical_name: string; canonical_normalized: string; inventory_item_id: string | null; fred_series_id: string | null }>;
    const synonyms = (syns || []) as Array<{ alias_normalized: string; canonical: string; reference_id: string | null }>;

    // Recipe-usage counts so we can show impact
    const { data: usage } = await sb
      .from("recipe_ingredients")
      .select("inventory_item_id, recipe_id")
      .not("inventory_item_id", "is", null);
    const recipesByItem = new Map<string, Set<string>>();
    for (const u of (usage || []) as Array<{ inventory_item_id: string; recipe_id: string }>) {
      if (!u.inventory_item_id) continue;
      if (!recipesByItem.has(u.inventory_item_id)) recipesByItem.set(u.inventory_item_id, new Set());
      recipesByItem.get(u.inventory_item_id)!.add(u.recipe_id);
    }

    // Indexes for matching
    const invByNormalizedName = new Map<string, typeof inventory[number]>();
    for (const it of inventory) invByNormalizedName.set(normalize(it.name), it);
    const invById = new Map(inventory.map((i) => [i.id, i] as const));
    const referenceBySeries = new Map<string, typeof references[number]>();
    for (const r of references) if (r.fred_series_id) referenceBySeries.set(r.fred_series_id, r);

    const synByAlias = new Map(synonyms.map((s) => [s.alias_normalized, s] as const));

    function findMatch(seriesId: string, keywords: string[], label: string): Match | null {
      // 1. explicit reference override
      const refOverride = referenceBySeries.get(seriesId);
      if (refOverride?.inventory_item_id) {
        const it = invById.get(refOverride.inventory_item_id);
        if (it) return {
          inventory_item_id: it.id,
          inventory_name: it.name,
          current_unit_cost: Number(it.average_cost_per_unit || 0),
          match_score: 1,
          match_source: "reference_override",
        };
      }
      // 2. keyword match against inventory names
      for (const kw of keywords || []) {
        const norm = normalize(kw);
        if (!norm || norm.startsWith("__")) continue;
        const direct = invByNormalizedName.get(norm);
        if (direct) return {
          inventory_item_id: direct.id,
          inventory_name: direct.name,
          current_unit_cost: Number(direct.average_cost_per_unit || 0),
          match_score: 0.95,
          match_source: "keyword",
        };
        // synonym table (alias -> canonical)
        const syn = synByAlias.get(norm);
        if (syn) {
          const it = invByNormalizedName.get(normalize(syn.canonical));
          if (it) return {
            inventory_item_id: it.id,
            inventory_name: it.name,
            current_unit_cost: Number(it.average_cost_per_unit || 0),
            match_score: 0.85,
            match_source: "synonym",
          };
        }
        // partial inventory name contains keyword
        for (const it of inventory) {
          if (normalize(it.name).split(" ").includes(norm)) {
            return {
              inventory_item_id: it.id,
              inventory_name: it.name,
              current_unit_cost: Number(it.average_cost_per_unit || 0),
              match_score: 0.7,
              match_source: "name",
            };
          }
        }
      }
      // 3. nothing matched
      return null;
    }

    const out: FredRow[] = [];
    const errors: { series_id: string; error: string }[] = [];

    // Run FRED requests with light concurrency to avoid rate limits
    const concurrency = 6;
    let cursor = 0;
    async function worker() {
      while (cursor < series.length) {
        const idx = cursor++;
        const s = series[idx];
        try {
          const obs = await fetchLatestObservation(s.series_id, apiKey);
          if (!obs) continue;
          const fredValue = obs.value * (s.unit_conversion || 1);
          const match = findMatch(s.series_id, s.match_keywords || [], s.label);
          const pct = match && match.current_unit_cost > 0
            ? ((fredValue - match.current_unit_cost) / match.current_unit_cost) * 100
            : null;
          out.push({
            series_id: s.series_id,
            label: s.label,
            unit: s.unit,
            unit_conversion: s.unit_conversion,
            category: s.category,
            observation_date: obs.date,
            observation_value: fredValue,
            match,
            pct_change: pct,
            affected_recipes: match ? (recipesByItem.get(match.inventory_item_id)?.size || 0) : 0,
            suggested_inventory_name: s.label.replace(/\s*\([^)]*\)\s*$/, "").trim(),
          });
        } catch (e: any) {
          errors.push({ series_id: s.series_id, error: e?.message || "Unknown error" });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return {
      pulled_at: new Date().toISOString(),
      series_count: series.length,
      preview: out.sort((a, b) => (b.match ? 1 : 0) - (a.match ? 1 : 0) || a.label.localeCompare(b.label)),
      errors,
    };
  });

/**
 * Apply selected FRED preview rows: update inventory cost + price history + monthly snapshot,
 * and recompute every recipe that uses the affected items.
 */
export const applyFredPull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    actions: Array<{
      series_id: string;
      action: "apply" | "create";
      // For "apply": existing inventory_item_id
      inventory_item_id?: string;
      // For "create": proposed name + unit
      new_name?: string;
      new_unit?: string;
      // Always required from the preview to keep this endpoint stateless
      observation_value: number;
      observation_date: string; // YYYY-MM-DD
      unit: string;
      label: string;
    }>;
  }) => {
    if (!data || !Array.isArray(data.actions)) throw new Error("actions array required");
    if (data.actions.length === 0) throw new Error("actions is empty");
    if (data.actions.length > 200) throw new Error("too many actions (max 200)");
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const userId = await requireAdmin(sb);

    let applied = 0;
    let created = 0;
    let recipesRecomputed = 0;
    const errors: { series_id: string; error: string }[] = [];
    const recipesToRecompute = new Set<string>();

    const monthYYYYMM = (d: string) => d.slice(0, 7);

    for (const a of data.actions) {
      try {
        let invId: string | null = null;
        let canonicalName: string | null = null;

        if (a.action === "apply") {
          if (!a.inventory_item_id) throw new Error("inventory_item_id required for apply");
          invId = a.inventory_item_id;
          const { data: existing } = await sb.from("inventory_items").select("name").eq("id", invId).maybeSingle();
          canonicalName = existing?.name || null;
        } else if (a.action === "create") {
          const name = (a.new_name || a.label).trim();
          if (!name) throw new Error("new_name required for create");
          const { data: created_item, error: createErr } = await sb
            .from("inventory_items")
            .insert({
              name,
              unit: a.new_unit || a.unit || "each",
              average_cost_per_unit: a.observation_value,
              last_receipt_cost: a.observation_value,
              pending_review: true,
              created_source: "fred",
            })
            .select("id, name")
            .single();
          if (createErr || !created_item) throw new Error(createErr?.message || "Failed to create inventory item");
          invId = created_item.id;
          canonicalName = created_item.name;
          created += 1;
        } else {
          continue;
        }

        if (!invId) continue;

        // Update inventory cost (apply path) + last_receipt_cost
        if (a.action === "apply") {
          const { error: updErr } = await sb
            .from("inventory_items")
            .update({
              average_cost_per_unit: a.observation_value,
              last_receipt_cost: a.observation_value,
            })
            .eq("id", invId);
          if (updErr) throw new Error(updErr.message);
          applied += 1;
        }

        // Append to price_history (audit trail)
        await sb.from("price_history").insert({
          inventory_item_id: invId,
          unit_price: a.observation_value,
          unit: a.unit || null,
          source: "fred",
          observed_at: new Date(a.observation_date).toISOString(),
          notes: `FRED ${a.series_id} (${a.label})`,
        });

        // Append a national_price_snapshot if we have a matching reference
        const { data: ref } = await sb
          .from("ingredient_reference")
          .select("id")
          .eq("inventory_item_id", invId)
          .maybeSingle();
        if (ref?.id) {
          await sb.from("national_price_snapshots").insert({
            ingredient_id: ref.id,
            price: a.observation_value,
            unit: a.unit || "each",
            month: monthYYYYMM(a.observation_date),
            source: `fred:${a.series_id}`,
            region: "US",
          }).then(() => null, () => null); // ignore unique-violation duplicates
        }

        // Collect recipes that need recomputing
        const { data: usage } = await sb
          .from("recipe_ingredients")
          .select("recipe_id")
          .eq("inventory_item_id", invId);
        for (const u of (usage || []) as Array<{ recipe_id: string }>) {
          recipesToRecompute.add(u.recipe_id);
        }
      } catch (e: any) {
        errors.push({ series_id: a.series_id, error: e?.message || "Unknown error" });
      }
    }

    // Recompute affected recipes
    for (const recipeId of recipesToRecompute) {
      const { error } = await sb.rpc("recompute_recipe_cost", { _recipe_id: recipeId });
      if (!error) recipesRecomputed += 1;
    }

    // Audit log entry
    await sb.from("fred_pull_log").insert({
      pulled_by: userId,
      series_count: data.actions.length,
      matched_count: data.actions.filter((x) => x.action === "apply").length,
      applied_count: applied,
      created_count: created,
      skipped_count: 0,
      errors: errors,
      notes: null,
    }).then(() => null, () => null);

    return {
      applied,
      created,
      recipes_recomputed: recipesRecomputed,
      errors,
    };
  });

/**
 * Save the optional FRED API key DB override (admin only).
 * Pass empty string to clear the override (then env secret is used).
 */
export const setFredApiKeyOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { value: string }) => {
    if (typeof data?.value !== "string") throw new Error("value must be a string");
    if (data.value.length > 200) throw new Error("value too long");
    return { value: data.value };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const userId = await requireAdmin(sb);
    const trimmed = data.value.trim();
    if (trimmed.length === 0) {
      await sb.from("app_kv").delete().eq("key", "fred_api_key_override");
      return { cleared: true };
    }
    await sb.from("app_kv").upsert({
      key: "fred_api_key_override",
      value: trimmed,
      updated_by: userId,
    }, { onConflict: "key" });
    return { saved: true };
  });
