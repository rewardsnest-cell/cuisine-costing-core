import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * FRED Series Mapping management.
 *
 * Companion to fred-pricing.functions.ts. These endpoints power the admin
 * "FRED Series Mapping" UI: list mappings with current observations, test a
 * single series before saving, suggest mappings for unmapped ingredients, and
 * upsert/delete a mapping row.
 *
 * No automatic side effects — admins explicitly Save/Apply.
 */

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function getFredApiKey(sb: any): Promise<string> {
  const { data } = await sb
    .from("app_kv")
    .select("value")
    .eq("key", "fred_api_key_override")
    .maybeSingle();
  const dbKey = (data?.value || "").trim();
  if (dbKey) return dbKey;
  const env = process.env.FRED_API_KEY;
  if (!env) throw new Error("FRED_API_KEY is not configured.");
  return env;
}

async function requireAdmin(sb: any) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required");
  return user.id as string;
}

async function fetchLatestObservation(
  seriesId: string,
  apiKey: string,
): Promise<{ date: string; value: number } | null> {
  const url = `${FRED_BASE}?series_id=${encodeURIComponent(
    seriesId,
  )}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FRED ${seriesId} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const obs = (data?.observations || [])[0];
  if (!obs || obs.value === ".") return null;
  const value = Number(obs.value);
  if (!Number.isFinite(value)) return null;
  return { date: obs.date, value };
}

/**
 * List all FRED mappings, joined with their linked ingredient (via match_keywords →
 * ingredient_reference) and the last pull date from fred_pull_log. Includes
 * latest observation if cheap to fetch (best-effort, single concurrent batch).
 */
export const listFredMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { includeObservations?: boolean }) => data ?? {})
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);

    const [{ data: mappings }, { data: refs }, { data: lastPull }] = await Promise.all([
      sb
        .from("fred_series_map")
        .select("id, series_id, label, match_keywords, unit, unit_conversion, category, active, priority, notes, updated_at")
        .order("label"),
      sb
        .from("ingredient_reference")
        .select("id, canonical_name, canonical_normalized, inventory_item_id, fred_series_id"),
      sb
        .from("fred_pull_log")
        .select("pulled_at, applied_count, created_count, errors")
        .order("pulled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const references = (refs || []) as Array<{
      id: string;
      canonical_name: string;
      canonical_normalized: string;
      inventory_item_id: string | null;
      fred_series_id: string | null;
    }>;
    const refByNormalized = new Map<string, (typeof references)[number]>();
    for (const r of references) refByNormalized.set(r.canonical_normalized, r);
    const refBySeries = new Map<string, (typeof references)[number]>();
    for (const r of references) if (r.fred_series_id) refBySeries.set(r.fred_series_id, r);

    const rows = ((mappings || []) as Array<any>).map((m) => {
      // Try explicit fred_series_id link first, then keyword → reference name match.
      let linkedRef = refBySeries.get(m.series_id) || null;
      if (!linkedRef) {
        for (const kw of (m.match_keywords as string[]) || []) {
          const r = refByNormalized.get(normalize(kw));
          if (r) {
            linkedRef = r;
            break;
          }
        }
      }
      return {
        id: m.id as string,
        series_id: m.series_id as string,
        label: m.label as string,
        match_keywords: (m.match_keywords as string[]) || [],
        unit: m.unit as string,
        unit_conversion: Number(m.unit_conversion) || 1,
        category: m.category as string | null,
        active: !!m.active,
        priority: (m.priority as "primary" | "fallback") || "primary",
        notes: m.notes as string | null,
        updated_at: m.updated_at as string,
        linked_reference_id: linkedRef?.id ?? null,
        linked_reference_name: linkedRef?.canonical_name ?? null,
        linked_inventory_item_id: linkedRef?.inventory_item_id ?? null,
      };
    });

    // Optionally fetch latest observation for every mapping (capped concurrency).
    let observations: Record<string, { date: string; value: number; converted: number } | null> = {};
    if (data?.includeObservations) {
      const apiKey = await getFredApiKey(sb).catch(() => null);
      if (apiKey) {
        const concurrency = 6;
        let cursor = 0;
        const work = async () => {
          while (cursor < rows.length) {
            const i = cursor++;
            const r = rows[i];
            try {
              const obs = await fetchLatestObservation(r.series_id, apiKey);
              observations[r.series_id] = obs
                ? { ...obs, converted: obs.value * r.unit_conversion }
                : null;
            } catch {
              observations[r.series_id] = null;
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, work));
      }
    }

    return {
      mappings: rows,
      observations,
      last_pull_at: (lastPull as any)?.pulled_at || null,
    };
  });

/**
 * Test a single FRED series ID against an ingredient WITHOUT saving anything.
 * Returns the latest observation, the converted value, and the current cost
 * of the linked inventory item for side-by-side comparison.
 */
export const testFredSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      series_id: string;
      reference_id?: string | null;
      unit_conversion?: number;
    }) => {
      if (!data?.series_id || typeof data.series_id !== "string")
        throw new Error("series_id required");
      if (data.series_id.length > 64) throw new Error("series_id too long");
      const conv = data.unit_conversion;
      if (conv != null && (!Number.isFinite(conv) || conv <= 0))
        throw new Error("unit_conversion must be > 0");
      return {
        series_id: data.series_id.trim(),
        reference_id: data.reference_id || null,
        unit_conversion: conv ?? 1,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);
    const apiKey = await getFredApiKey(sb);

    const obs = await fetchLatestObservation(data.series_id, apiKey);
    if (!obs) {
      return {
        ok: false as const,
        error: "FRED returned no observation for this series",
      };
    }

    const converted = obs.value * data.unit_conversion;

    let currentCost: number | null = null;
    let inventoryName: string | null = null;
    let inventoryUnit: string | null = null;
    if (data.reference_id) {
      const { data: ref } = await sb
        .from("ingredient_reference")
        .select("inventory_item_id, canonical_name")
        .eq("id", data.reference_id)
        .maybeSingle();
      if (ref?.inventory_item_id) {
        const { data: inv } = await sb
          .from("inventory_items")
          .select("name, unit, average_cost_per_unit")
          .eq("id", ref.inventory_item_id)
          .maybeSingle();
        if (inv) {
          currentCost = Number(inv.average_cost_per_unit) || 0;
          inventoryName = inv.name;
          inventoryUnit = inv.unit;
        }
      }
      if (!inventoryName) inventoryName = (ref as any)?.canonical_name ?? null;
    }

    const pct =
      currentCost && currentCost > 0
        ? ((converted - currentCost) / currentCost) * 100
        : null;

    return {
      ok: true as const,
      observation_date: obs.date,
      observation_value: obs.value,
      converted_value: converted,
      current_cost: currentCost,
      inventory_name: inventoryName,
      inventory_unit: inventoryUnit,
      pct_change: pct,
    };
  });

/**
 * Suggest FRED series for unmapped ingredients using token overlap against
 * existing mappings' label and match_keywords, plus ingredient_synonyms.
 * Read-only — admin reviews and applies via upsertFredMapping.
 */
export const suggestFredMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number }) => ({
    limit: Math.min(Math.max(Number(data?.limit) || 50, 1), 200),
  }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);

    const [{ data: refs }, { data: mappings }, { data: syns }] = await Promise.all([
      sb
        .from("ingredient_reference")
        .select("id, canonical_name, canonical_normalized")
        .order("canonical_name"),
      sb
        .from("fred_series_map")
        .select("series_id, label, match_keywords, unit, unit_conversion, category"),
      sb.from("ingredient_synonyms").select("alias_normalized, canonical, reference_id"),
    ]);

    const references = (refs || []) as Array<{
      id: string;
      canonical_name: string;
      canonical_normalized: string;
    }>;
    const allMappings = (mappings || []) as Array<{
      series_id: string;
      label: string;
      match_keywords: string[];
      unit: string;
      unit_conversion: number;
      category: string | null;
    }>;
    const synonyms = (syns || []) as Array<{
      alias_normalized: string;
      canonical: string;
      reference_id: string | null;
    }>;

    // Collect set of reference IDs that are already linked via keyword.
    const mappedRefIds = new Set<string>();
    const refByNormalized = new Map<string, (typeof references)[number]>();
    for (const r of references) refByNormalized.set(r.canonical_normalized, r);
    for (const m of allMappings) {
      for (const kw of m.match_keywords || []) {
        const r = refByNormalized.get(normalize(kw));
        if (r) mappedRefIds.add(r.id);
      }
    }

    // Build per-mapping keyword token bag.
    const mappingTokens = allMappings.map((m) => {
      const all = [m.label, ...(m.match_keywords || [])].join(" ");
      const tokens = new Set(normalize(all).split(" ").filter((t) => t.length > 2));
      return { mapping: m, tokens };
    });

    const synByCanonical = new Map<string, string[]>();
    for (const s of synonyms) {
      const k = normalize(s.canonical);
      if (!synByCanonical.has(k)) synByCanonical.set(k, []);
      synByCanonical.get(k)!.push(s.alias_normalized);
    }

    const suggestions: Array<{
      reference_id: string;
      reference_name: string;
      series_id: string;
      label: string;
      unit: string;
      unit_conversion: number;
      score: number;
      reason: string;
    }> = [];

    for (const r of references) {
      if (mappedRefIds.has(r.id)) continue;

      // Token bag for this ingredient = its name + all its synonyms.
      const aliases = synByCanonical.get(r.canonical_normalized) || [];
      const refTokens = new Set(
        normalize([r.canonical_name, ...aliases].join(" "))
          .split(" ")
          .filter((t) => t.length > 2),
      );
      if (refTokens.size === 0) continue;

      let best: { mapping: (typeof allMappings)[number]; score: number; overlap: string[] } | null =
        null;
      for (const { mapping, tokens } of mappingTokens) {
        const overlap: string[] = [];
        for (const t of refTokens) if (tokens.has(t)) overlap.push(t);
        if (overlap.length === 0) continue;
        const score = overlap.length / Math.max(refTokens.size, tokens.size);
        if (!best || score > best.score) best = { mapping, score, overlap };
      }
      if (best && best.score >= 0.25) {
        suggestions.push({
          reference_id: r.id,
          reference_name: r.canonical_name,
          series_id: best.mapping.series_id,
          label: best.mapping.label,
          unit: best.mapping.unit,
          unit_conversion: best.mapping.unit_conversion,
          score: Math.round(best.score * 100) / 100,
          reason: `matched on: ${best.overlap.slice(0, 4).join(", ")}`,
        });
      }
      if (suggestions.length >= data.limit) break;
    }

    suggestions.sort((a, b) => b.score - a.score);
    return { suggestions, total_unmapped: references.length - mappedRefIds.size };
  });

/**
 * Insert or update a single FRED series mapping. If `reference_id` is provided,
 * we also write the FRED series id to ingredient_reference.fred_series_id so
 * the matcher can find it without keyword guessing.
 */
export const upsertFredMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string | null;
      series_id: string;
      label: string;
      match_keywords?: string[];
      unit?: string;
      unit_conversion?: number;
      category?: string | null;
      active?: boolean;
      priority?: "primary" | "fallback";
      notes?: string | null;
      reference_id?: string | null;
    }) => {
      if (!data?.series_id?.trim()) throw new Error("series_id required");
      if (!data?.label?.trim()) throw new Error("label required");
      if (data.series_id.length > 64) throw new Error("series_id too long");
      if (data.label.length > 200) throw new Error("label too long");
      const conv = data.unit_conversion;
      if (conv != null && (!Number.isFinite(conv) || conv <= 0))
        throw new Error("unit_conversion must be > 0");
      if (data.priority && !["primary", "fallback"].includes(data.priority))
        throw new Error("priority must be primary or fallback");
      return {
        id: data.id || null,
        series_id: data.series_id.trim(),
        label: data.label.trim(),
        match_keywords: Array.isArray(data.match_keywords)
          ? data.match_keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 30)
          : [],
        unit: (data.unit || "lb").trim(),
        unit_conversion: conv ?? 1,
        category: data.category ? String(data.category).slice(0, 80) : null,
        active: data.active !== false,
        priority: data.priority || "primary",
        notes: data.notes ? String(data.notes).slice(0, 500) : null,
        reference_id: data.reference_id || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);

    const row = {
      series_id: data.series_id,
      label: data.label,
      match_keywords: data.match_keywords,
      unit: data.unit,
      unit_conversion: data.unit_conversion,
      category: data.category,
      active: data.active,
      priority: data.priority,
      notes: data.notes,
    };

    let savedId: string;
    if (data.id) {
      const { error } = await sb.from("fred_series_map").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      savedId = data.id;
    } else {
      const { data: ins, error } = await sb
        .from("fred_series_map")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      savedId = (ins as any).id;
    }

    // Optional: also persist series_id on the linked ingredient_reference so
    // the matcher prefers it as an explicit override.
    if (data.reference_id) {
      await sb
        .from("ingredient_reference")
        .update({ fred_series_id: data.series_id })
        .eq("id", data.reference_id);
    }

    return { id: savedId };
  });

export const deleteFredMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await requireAdmin(sb);
    const { error } = await sb.from("fred_series_map").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
