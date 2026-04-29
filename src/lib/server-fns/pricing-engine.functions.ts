// Pricing Engine v3 — admin server functions.
// All routes are admin-only. The only external pricing source is the
// Grocery Pricing API (RapidAPI). All math flows through:
//   IngredientService -> PriceService -> RecipeCostService

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALLOWED_BASE_UNITS, convertQty } from "@/lib/server/pricing-engine/units";
import { fetchGroceryPrice } from "@/lib/server/pricing-engine/grocery-api";
import {
  discoverPrices,
  pickBestPrice,
  confidenceFromScore,
} from "@/lib/server/pricing-engine/price-discovery";
import {
  pickCanonicalInventoryId,
  consolidateInventoryItems,
} from "@/lib/server/pricing-engine/canonical-inventory";

const STALE_AFTER_DAYS = 7;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(`Auth check failed: ${error.message}`);
  if (!data) throw new Error("Admin role required");
}

// ---------- IngredientService ----------

export const peListIngredients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: ingredients, error } = await supabaseAdmin
      .from("pe_ingredients")
      .select("*")
      .order("canonical_name");
    if (error) throw new Error(error.message);
    const { data: aliases } = await supabaseAdmin
      .from("pe_ingredient_aliases")
      .select("*");
    return { ingredients: ingredients ?? [], aliases: aliases ?? [] };
  });

const upsertIngredientSchema = z.object({
  id: z.string().uuid().optional(),
  canonical_name: z.string().min(1).max(120),
  base_unit: z.enum(ALLOWED_BASE_UNITS as unknown as [string, ...string[]]),
  category: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  aliases: z.array(z.string().min(1).max(120)).max(50).optional(),
});

export const peUpsertIngredient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertIngredientSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { aliases, id, ...row } = data;

    let ingredientId = id;
    if (id) {
      const { error } = await supabaseAdmin
        .from("pe_ingredients")
        .update(row)
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("pe_ingredients")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      ingredientId = ins!.id;
    }

    if (aliases && ingredientId) {
      // replace alias set
      await supabaseAdmin.from("pe_ingredient_aliases").delete().eq("ingredient_id", ingredientId);
      if (aliases.length > 0) {
        const rows = aliases.map((a) => ({ ingredient_id: ingredientId!, alias: a.toLowerCase().trim() }));
        const { error } = await supabaseAdmin.from("pe_ingredient_aliases").insert(rows);
        if (error) throw new Error(`Alias save failed: ${error.message}`);
      }
    }
    return { id: ingredientId };
  });

export const peDeleteIngredient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("pe_ingredients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const STARTER_INGREDIENTS = [
  { canonical_name: "Chicken Breast", base_unit: "lb", category: "protein", aliases: ["chicken", "boneless chicken breast"] },
  { canonical_name: "Ground Beef", base_unit: "lb", category: "protein", aliases: ["beef", "hamburger meat"] },
  { canonical_name: "Olive Oil", base_unit: "ml", category: "pantry", aliases: ["extra virgin olive oil", "evoo"] },
  { canonical_name: "Garlic", base_unit: "each", category: "produce", aliases: ["garlic clove", "garlic cloves"] },
  { canonical_name: "Onion", base_unit: "lb", category: "produce", aliases: ["yellow onion", "onions"] },
  { canonical_name: "Tomato", base_unit: "lb", category: "produce", aliases: ["tomatoes", "roma tomato"] },
  { canonical_name: "Rice", base_unit: "lb", category: "dry goods", aliases: ["white rice", "long grain rice"] },
  { canonical_name: "Flour", base_unit: "lb", category: "dry goods", aliases: ["all purpose flour", "ap flour"] },
  { canonical_name: "Sugar", base_unit: "lb", category: "dry goods", aliases: ["granulated sugar", "white sugar"] },
  { canonical_name: "Milk", base_unit: "ml", category: "dairy", aliases: ["whole milk", "2% milk"] },
] as const;

export const peSeedStarterIngredients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const ingredientRows = STARTER_INGREDIENTS.map(({ aliases: _aliases, ...row }) => ({
      ...row,
      notes: "Starter ingredient for Pricing v3 bootstrap",
    }));
    const { error: upsertError } = await supabaseAdmin
      .from("pe_ingredients")
      .upsert(ingredientRows, { onConflict: "canonical_name" });
    if (upsertError) throw new Error(upsertError.message);

    const names = STARTER_INGREDIENTS.map((i) => i.canonical_name);
    const { data: ingredients, error: listError } = await supabaseAdmin
      .from("pe_ingredients")
      .select("id, canonical_name")
      .in("canonical_name", names);
    if (listError) throw new Error(listError.message);

    const idByName = new Map((ingredients ?? []).map((i) => [i.canonical_name, i.id]));
    const aliasRows = STARTER_INGREDIENTS.flatMap((ing) => {
      const ingredient_id = idByName.get(ing.canonical_name);
      return ingredient_id
        ? ing.aliases.map((alias) => ({ ingredient_id, alias: alias.toLowerCase().trim() }))
        : [];
    });
    if (aliasRows.length > 0) {
      const { error: aliasError } = await supabaseAdmin
        .from("pe_ingredient_aliases")
        .upsert(aliasRows, { onConflict: "alias" });
      if (aliasError) throw new Error(aliasError.message);
    }

    return { inserted_or_updated: ingredientRows.length, aliases: aliasRows.length };
  });

// Map a raw recipe unit string -> one of pe_ingredients.base_unit values.
// Falls back to "each" for unknown / count-style units.
function inferBaseUnit(rawUnit: string | null | undefined): string {
  const u = (rawUnit ?? "").toLowerCase().trim().replace(/\.$/, "");
  if (!u) return "each";
  // weight
  if (["lb", "lbs", "pound", "pounds"].includes(u)) return "lb";
  if (["oz", "ounce", "ounces"].includes(u)) return "oz";
  if (["g", "gram", "grams"].includes(u)) return "g";
  if (["kg", "kilogram", "kilograms"].includes(u)) return "kg";
  // volume
  if (["ml", "milliliter", "milliliters"].includes(u)) return "ml";
  if (["l", "liter", "liters", "litre"].includes(u)) return "l";
  if (["fl oz", "floz", "fluid ounce", "fluid ounces"].includes(u)) return "fl oz";
  if (["cup", "cups", "c"].includes(u)) return "cup";
  if (["tbsp", "tablespoon", "tablespoons"].includes(u)) return "tbsp";
  if (["tsp", "teaspoon", "teaspoons"].includes(u)) return "tsp";
  // everything else (each, clove, head, slice, piece, pinch, dash, can, jar, bag, ...)
  return "each";
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Pull every distinct ingredient name from recipe_ingredients,
 * dedupe case/whitespace-insensitively, infer a sensible base unit
 * from the most-common recipe unit, and upsert into pe_ingredients.
 *
 * Existing rows (matched by canonical_name) are NOT overwritten —
 * their base_unit / category / notes are preserved.
 */
export const peSyncIngredientsFromRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // 1. Pull all (name, unit) pairs from recipe_ingredients.
    const { data: rows, error } = await supabaseAdmin
      .from("recipe_ingredients")
      .select("name, unit")
      .not("name", "is", null);
    if (error) throw new Error(`Failed to read recipe ingredients: ${error.message}`);

    const scanned = rows?.length ?? 0;

    // 2. Group by normalized key, count unit occurrences, keep a display name.
    type Bucket = { display: string; unitCounts: Map<string, number> };
    const buckets = new Map<string, Bucket>();
    for (const r of rows ?? []) {
      const raw = (r.name ?? "").toString().trim();
      if (!raw) continue;
      const key = raw.toLowerCase().replace(/\s+/g, " ");
      if (key.length > 120) continue;
      let b = buckets.get(key);
      if (!b) {
        b = { display: titleCase(raw), unitCounts: new Map() };
        buckets.set(key, b);
      }
      const u = (r.unit ?? "").toString();
      b.unitCounts.set(u, (b.unitCounts.get(u) ?? 0) + 1);
    }

    if (buckets.size === 0) {
      return { scanned, unique: 0, inserted: 0, skipped_existing: 0, aliases: 0 };
    }

    // 3. Find which canonical_names already exist so we don't overwrite them.
    const allDisplayNames = Array.from(buckets.values()).map((b) => b.display);
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("pe_ingredients")
      .select("canonical_name")
      .in("canonical_name", allDisplayNames);
    if (existErr) throw new Error(`Existence check failed: ${existErr.message}`);
    const existingSet = new Set((existing ?? []).map((e) => e.canonical_name.toLowerCase()));

    // 4. Build insert rows for net-new ingredients only.
    const toInsert: { canonical_name: string; base_unit: string; category: string | null; notes: string }[] = [];
    const aliasInserts: { canonical_name: string; alias: string }[] = [];

    for (const [key, b] of buckets.entries()) {
      if (existingSet.has(b.display.toLowerCase())) continue;
      // pick most-common unit -> infer base_unit
      let topUnit = "";
      let topCount = -1;
      for (const [u, c] of b.unitCounts.entries()) {
        if (c > topCount) {
          topCount = c;
          topUnit = u;
        }
      }
      toInsert.push({
        canonical_name: b.display,
        base_unit: inferBaseUnit(topUnit),
        category: null,
        notes: "Imported from recipes",
      });
      // record the lowercase raw name as an alias if it differs from display
      if (key !== b.display.toLowerCase()) {
        aliasInserts.push({ canonical_name: b.display, alias: key });
      }
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      // Insert in batches of 200 to stay friendly to PostgREST.
      const CHUNK = 200;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const slice = toInsert.slice(i, i + CHUNK);
        const { error: insErr } = await supabaseAdmin
          .from("pe_ingredients")
          .upsert(slice, { onConflict: "canonical_name", ignoreDuplicates: true });
        if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
        inserted += slice.length;
      }
    }

    // 5. Attach aliases (lower-case raw recipe name) for the newly created rows.
    let aliasCount = 0;
    if (aliasInserts.length > 0) {
      const newNames = Array.from(new Set(aliasInserts.map((a) => a.canonical_name)));
      const { data: newRows } = await supabaseAdmin
        .from("pe_ingredients")
        .select("id, canonical_name")
        .in("canonical_name", newNames);
      const idByName = new Map((newRows ?? []).map((r) => [r.canonical_name, r.id]));
      const aliasRows = aliasInserts
        .map((a) => {
          const ingredient_id = idByName.get(a.canonical_name);
          return ingredient_id ? { ingredient_id, alias: a.alias } : null;
        })
        .filter(Boolean) as { ingredient_id: string; alias: string }[];
      if (aliasRows.length > 0) {
        const { error: aliasErr } = await supabaseAdmin
          .from("pe_ingredient_aliases")
          .upsert(aliasRows, { onConflict: "alias", ignoreDuplicates: true });
        if (!aliasErr) aliasCount = aliasRows.length;
      }
    }

    return {
      scanned,
      unique: buckets.size,
      inserted,
      skipped_existing: buckets.size - inserted,
      aliases: aliasCount,
    };
  });

// ---------- Duplicate Detection & Merging ----------

// Normalize a name for fuzzy comparison: lowercase, strip punctuation,
// collapse whitespace, drop common parenthetical notes, singularize plurals.
const DEFAULT_IGNORE_TOKENS = ["fresh", "raw", "whole", "large", "small", "medium", "organic", "the", "a", "an"];

function normalizeForMatch(s: string, ignoreTokens: string[] = DEFAULT_IGNORE_TOKENS): string {
  let t = s.toLowerCase().trim();
  t = t.replace(/\([^)]*\)/g, " "); // drop parentheticals
  t = t.replace(/[^a-z0-9\s]/g, " "); // strip punctuation
  t = t.replace(/\s+/g, " ").trim();
  // crude singularization on each token
  t = t
    .split(" ")
    .map((w) => {
      if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
      if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      return w;
    })
    .join(" ");
  // strip configurable filler words that don't change identity
  const STOP = new Set(ignoreTokens.map((x) => x.toLowerCase().trim()).filter(Boolean));
  t = t.split(" ").filter((w) => !STOP.has(w)).join(" ");
  return t.trim();
}

function tokenJaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0: number[] = new Array(b.length + 1);
  const v1: number[] = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  const lev = 1 - levenshtein(a, b) / maxLen;
  const jac = tokenJaccard(a, b);
  // weighted: tokens matter more for multi-word names
  return 0.55 * lev + 0.45 * jac;
}

type DupCandidate = {
  canonical_id: string;
  canonical_name: string;
  base_unit: string;
  members: { id: string; name: string; base_unit: string; score: number; source: "fuzzy" | "ai" }[];
  confidence: number; // 0..1, lowest member score
};

// Union-Find for clustering
class UF {
  parent: Map<string, string> = new Map();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = this.parent.get(x)!;
    while (r !== this.parent.get(r)!) r = this.parent.get(r)!;
    this.parent.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export const peFindIngredientDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      use_ai: z.boolean().optional(),
      min_confidence: z.number().min(0).max(1).optional(),
      link_threshold: z.number().min(0).max(1).optional(),
      ignore_tokens: z.array(z.string()).optional(),
      require_unit_match: z.boolean().optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Load configured match settings, fall back to per-call overrides, then defaults.
    const { data: settings } = await supabaseAdmin
      .from("pe_match_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const useAi = data.use_ai ?? settings?.use_ai_default ?? true;
    const autoMergeThreshold = data.min_confidence ?? Number(settings?.auto_merge_threshold ?? 0.85);
    const linkThreshold = data.link_threshold ?? Number(settings?.link_threshold ?? 0.7);
    const ignoreTokens = (data.ignore_tokens ?? (settings?.ignore_tokens as string[] | null) ?? DEFAULT_IGNORE_TOKENS);
    const requireUnitMatch = data.require_unit_match ?? settings?.require_unit_match ?? true;

    const { data: ings, error } = await supabaseAdmin
      .from("pe_ingredients")
      .select("id, canonical_name, base_unit");
    if (error) throw new Error(error.message);
    const items = (ings ?? []) as { id: string; canonical_name: string; base_unit: string }[];

    // Pre-compute normalized strings using configured ignore tokens.
    const norm = items.map((i) => ({ ...i, n: normalizeForMatch(i.canonical_name, ignoreTokens) }));

    const uf = new UF();
    const edgeScore = new Map<string, { score: number; source: "fuzzy" | "ai" }>();
    const ek = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

    const FUZZY_HIGH = autoMergeThreshold; // auto-cluster (pure fuzzy)
    const FUZZY_LOW = Math.max(0, linkThreshold - 0.1); // send borderline pairs to AI
    const ambiguousPairs: { a: typeof norm[0]; b: typeof norm[0]; fuzzy: number }[] = [];

    for (let i = 0; i < norm.length; i++) {
      for (let j = i + 1; j < norm.length; j++) {
        const A = norm[i], B = norm[j];
        if (requireUnitMatch && A.base_unit !== B.base_unit) continue; // skip unit mismatches when required
        // Cheap pre-filter: at least 2 chars in common at start
        if (A.n[0] !== B.n[0] && Math.abs(A.n.length - B.n.length) > 6) continue;
        const s = similarity(A.n, B.n);
        if (s >= FUZZY_HIGH) {
          uf.union(A.id, B.id);
          const k = ek(A.id, B.id);
          edgeScore.set(k, { score: s, source: "fuzzy" });
        } else if (s >= FUZZY_LOW) {
          ambiguousPairs.push({ a: A, b: B, fuzzy: s });
        }
      }
    }

    // AI pass for the ambiguous pairs.
    if (useAi && ambiguousPairs.length > 0) {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        // Batch in groups of 40 pairs to keep prompts small.
        const BATCH = 40;
        for (let i = 0; i < ambiguousPairs.length; i += BATCH) {
          const batch = ambiguousPairs.slice(i, i + BATCH);
          const pairs = batch.map((p, idx) => ({
            id: idx,
            a: p.a.canonical_name,
            b: p.b.canonical_name,
          }));
          try {
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "system",
                    content:
                      "You determine if two cooking-ingredient names refer to the SAME ingredient. " +
                      "Examples of same: 'scallions' = 'green onions', 'cilantro' = 'fresh coriander', 'EVOO' = 'extra virgin olive oil'. " +
                      "Different ingredients (e.g. butter vs ghee, cilantro vs parsley) must NOT be merged. " +
                      "Return a confidence 0..1 for each pair via the tool call.",
                  },
                  {
                    role: "user",
                    content: `Pairs to evaluate:\n${JSON.stringify(pairs, null, 2)}`,
                  },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "rate_pairs",
                      description: "Return same-ingredient confidence per pair id.",
                      parameters: {
                        type: "object",
                        properties: {
                          ratings: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "number" },
                                same: { type: "boolean" },
                                confidence: { type: "number" },
                              },
                              required: ["id", "same", "confidence"],
                            },
                          },
                        },
                        required: ["ratings"],
                      },
                    },
                  },
                ],
                tool_choice: { type: "function", function: { name: "rate_pairs" } },
              }),
            });
            if (resp.ok) {
              const j: any = await resp.json();
              const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
              if (args) {
                const parsed = JSON.parse(args);
                for (const r of parsed.ratings ?? []) {
                  if (r.same && r.confidence >= 0.8) {
                    const p = batch[r.id];
                    if (!p) continue;
                    uf.union(p.a.id, p.b.id);
                    edgeScore.set(ek(p.a.id, p.b.id), { score: r.confidence, source: "ai" });
                  }
                }
              }
            }
          } catch (e) {
            console.error("AI dedup batch failed:", e);
          }
        }
      }
    }

    // Build clusters (size > 1).
    const clusters = new Map<string, typeof norm>();
    for (const it of norm) {
      const root = uf.find(it.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(it);
    }

    // Pull alias / price counts so we can pick the "best" canonical (most usage).
    const dupClusters: DupCandidate[] = [];
    for (const [_, members] of clusters.entries()) {
      if (members.length < 2) continue;

      // Score each member by usage to pick canonical.
      const ids = members.map((m) => m.id);
      const [{ data: priceCounts }, { data: aliasCounts }] = await Promise.all([
        supabaseAdmin.from("pe_ingredient_prices").select("ingredient_id").in("ingredient_id", ids),
        supabaseAdmin.from("pe_ingredient_aliases").select("ingredient_id").in("ingredient_id", ids),
      ]);
      const usage = new Map<string, number>();
      for (const r of priceCounts ?? []) usage.set(r.ingredient_id, (usage.get(r.ingredient_id) ?? 0) + 3);
      for (const r of aliasCounts ?? []) usage.set(r.ingredient_id, (usage.get(r.ingredient_id) ?? 0) + 1);

      const ranked = [...members].sort((a, b) => {
        const ua = usage.get(a.id) ?? 0, ub = usage.get(b.id) ?? 0;
        if (ub !== ua) return ub - ua;
        // prefer shorter, more "canonical-looking" name
        return a.canonical_name.length - b.canonical_name.length;
      });
      const canonical = ranked[0];
      const others = ranked.slice(1);

      const memberPayload = others.map((m) => {
        const e = edgeScore.get(ek(canonical.id, m.id));
        return {
          id: m.id,
          name: m.canonical_name,
          base_unit: m.base_unit,
          score: e?.score ?? similarity(canonical.n, m.n),
          source: e?.source ?? ("fuzzy" as const),
        };
      });

      const conf = memberPayload.reduce((min, m) => Math.min(min, m.score), 1);
      dupClusters.push({
        canonical_id: canonical.id,
        canonical_name: canonical.canonical_name,
        base_unit: canonical.base_unit,
        members: memberPayload,
        confidence: conf,
      });
    }

    dupClusters.sort((a, b) => b.confidence - a.confidence);

    return {
      scanned: items.length,
      ai_pairs_evaluated: useAi ? ambiguousPairs.length : 0,
      clusters: dupClusters,
      auto_mergeable: dupClusters.filter((c) => c.confidence >= autoMergeThreshold).length,
      settings_used: {
        link_threshold: linkThreshold,
        auto_merge_threshold: autoMergeThreshold,
        ignore_tokens: ignoreTokens,
        require_unit_match: requireUnitMatch,
        use_ai: useAi,
      },
    };
  });

export const peMergeIngredients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      canonical_id: z.string().uuid(),
      losing_ids: z.array(z.string().uuid()).min(1).max(50),
      /** Optional hint: if supplied AND tied with the top-scored candidate,
       * this inventory_item_id is chosen as canonical. */
      preferred_inventory_id: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.losing_ids.includes(data.canonical_id)) {
      throw new Error("Canonical id cannot be in losing_ids");
    }

    // Fetch all ingredients to validate same base_unit + capture losing names.
    const allIds = [data.canonical_id, ...data.losing_ids];
    const { data: rows, error: rowErr } = await supabaseAdmin
      .from("pe_ingredients")
      .select("id, canonical_name, base_unit")
      .in("id", allIds);
    if (rowErr) throw new Error(rowErr.message);
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));
    const canonical = byId.get(data.canonical_id);
    if (!canonical) throw new Error("Canonical ingredient not found");

    for (const lid of data.losing_ids) {
      const r = byId.get(lid);
      if (!r) throw new Error(`Losing ingredient ${lid} not found`);
      if (r.base_unit !== canonical.base_unit) {
        throw new Error(
          `Cannot merge ${r.canonical_name} (${r.base_unit}) into ${canonical.canonical_name} (${canonical.base_unit}): base units differ`,
        );
      }
    }

    let prices_repointed = 0;
    let history_repointed = 0;
    let audit_repointed = 0;
    let aliases_added = 0;
    let references_repointed = 0;
    let recipe_links_repointed = 0;
    let inventory_items_consolidated = 0;
    let recipes_recomputed = 0;
    const warnings: string[] = [];

    // ----- Step 1: figure out which ingredient_reference rows correspond to the
    // canonical and the losing ingredients (matched by canonical_name + every alias).
    // pe_ingredients does NOT have a direct FK to ingredient_reference / inventory,
    // so we resolve the link by name. This is how recipes (which use
    // recipe_ingredients.inventory_item_id) get recomputed after a merge.
    const normName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

    const namesForIngredient = async (ingId: string, canonicalName: string) => {
      const out = new Set<string>([normName(canonicalName)]);
      const { data: aliasRows } = await supabaseAdmin
        .from("pe_ingredient_aliases")
        .select("alias")
        .eq("ingredient_id", ingId);
      for (const r of aliasRows ?? []) out.add(normName(r.alias as string));
      return Array.from(out);
    };

    const canonicalNames = await namesForIngredient(data.canonical_id, canonical.canonical_name);

    // Resolve canonical inventory_item_id deterministically. Gather every
    // inventory_item_id reachable from any reference row on the canonical OR
    // any losing ingredient, then rank them with a stable scoring rubric so
    // the same inputs always pick the same winner. The other inventory rows
    // get consolidated INTO the winner via cost_equivalent_of so historical
    // receipts and FKs are preserved.
    const allLosingNames: string[] = [];
    for (const lid of data.losing_ids) {
      const losing = byId.get(lid)!;
      const ns = await namesForIngredient(lid, losing.canonical_name);
      allLosingNames.push(...ns);
    }
    const allRefNames = Array.from(new Set([...canonicalNames, ...allLosingNames]));

    const { data: allRefs } = await supabaseAdmin
      .from("ingredient_reference")
      .select("inventory_item_id")
      .in("canonical_normalized", allRefNames);

    const candidateInvIds = Array.from(
      new Set(
        (allRefs ?? [])
          .map((r) => r.inventory_item_id)
          .filter((x): x is string => !!x),
      ),
    );

    const pick = await pickCanonicalInventoryId(
      supabaseAdmin,
      candidateInvIds,
      data.preferred_inventory_id ?? null,
    );
    const canonicalInventoryId = pick.canonical_id;
    const canonicalPickReport = {
      chosen_inventory_id: canonicalInventoryId,
      considered: pick.candidates,
    };

    // Track every recipe whose cost needs recomputation.
    const recipeIdsToRecompute = new Set<string>();

    // Pre-pass: if multiple inventory candidates exist, consolidate every
    // non-canonical one INTO the canonical id BEFORE we rewrite reference
    // rows. This guarantees recipe_ingredients converge on a single row.
    if (canonicalInventoryId && pick.losing_ids.length > 0) {
      const cons = await consolidateInventoryItems(
        supabaseAdmin,
        canonicalInventoryId,
        pick.losing_ids,
      );
      recipe_links_repointed += cons.recipe_links_repointed;
      references_repointed += cons.references_repointed;
      inventory_items_consolidated += cons.inventory_items_consolidated;
      for (const rid of cons.affected_recipe_ids) recipeIdsToRecompute.add(rid);
      for (const w of cons.warnings) warnings.push(w);
    }

    // ----- Step 2: per losing ingredient, repoint reference rows by name.
    // (Inventory pointers are already collapsed by the pre-pass above.)
    for (const lid of data.losing_ids) {
      const losing = byId.get(lid)!;
      const losingNames = await namesForIngredient(lid, losing.canonical_name);

      const { data: losingRefs } = await supabaseAdmin
        .from("ingredient_reference")
        .select("id, inventory_item_id, canonical_normalized")
        .in("canonical_normalized", losingNames);

      for (const ref of losingRefs ?? []) {
        // Update the reference row itself: name → canonical, inventory_item_id →
        // canonical (or keep the losing one if canonical had none, so we don't
        // orphan recipes that already linked to it).
        const newInventoryId =
          canonicalInventoryId ?? ref.inventory_item_id ?? null;
        const { error: refUpErr } = await supabaseAdmin
          .from("ingredient_reference")
          .update({
            canonical_name: canonical.canonical_name,
            canonical_normalized: normName(canonical.canonical_name),
            inventory_item_id: newInventoryId,
          })
          .eq("id", ref.id);
        if (refUpErr) {
          // Most likely a unique-constraint collision with the canonical reference
          // row — in that case the losing reference row is now redundant and we
          // can safely delete it (its recipes are already re-pointed above).
          await supabaseAdmin.from("ingredient_reference").delete().eq("id", ref.id);
        }
        references_repointed++;
      }


      // pe_ingredient_prices: PK is ingredient_id (one price row per ingredient).
      // If canonical already has a row, drop the losing row; otherwise re-point it.
      const { data: canonHasPrice } = await supabaseAdmin
        .from("pe_ingredient_prices")
        .select("ingredient_id")
        .eq("ingredient_id", data.canonical_id)
        .maybeSingle();
      if (canonHasPrice) {
        const { error: delPriceErr } = await supabaseAdmin
          .from("pe_ingredient_prices")
          .delete()
          .eq("ingredient_id", lid);
        if (!delPriceErr) prices_repointed++;
      } else {
        const { error: upErr } = await supabaseAdmin
          .from("pe_ingredient_prices")
          .update({ ingredient_id: data.canonical_id })
          .eq("ingredient_id", lid);
        if (!upErr) prices_repointed++;
      }

      // pe_price_history
      const { error: histErr, count: histCount } = await supabaseAdmin
        .from("pe_price_history")
        .update({ ingredient_id: data.canonical_id }, { count: "exact" })
        .eq("ingredient_id", lid);
      if (!histErr && histCount) history_repointed += histCount;

      // pe_price_overrides_audit
      const { error: auditErr, count: auditCount } = await supabaseAdmin
        .from("pe_price_overrides_audit")
        .update({ ingredient_id: data.canonical_id }, { count: "exact" })
        .eq("ingredient_id", lid);
      if (!auditErr && auditCount) audit_repointed += auditCount;

      // Aliases: re-point existing aliases, then add the losing canonical_name itself as an alias.
      await supabaseAdmin
        .from("pe_ingredient_aliases")
        .update({ ingredient_id: data.canonical_id })
        .eq("ingredient_id", lid);

      const aliasName = losing.canonical_name.toLowerCase().trim();
      const { error: aliasErr } = await supabaseAdmin
        .from("pe_ingredient_aliases")
        .upsert(
          { ingredient_id: data.canonical_id, alias: aliasName },
          { onConflict: "alias", ignoreDuplicates: true },
        );
      if (!aliasErr) aliases_added++;
    }

    // ----- Step 3: delete the losing pe_ingredients (cascades clean orphans).
    const { error: delErr } = await supabaseAdmin
      .from("pe_ingredients")
      .delete()
      .in("id", data.losing_ids);
    if (delErr) throw new Error(`Delete failed: ${delErr.message}`);

    // ----- Step 4: recompute affected recipe costs so any stale per-unit prices
    // pulled from the now-canonical ingredient flow back into recipe totals.
    for (const recipeId of recipeIdsToRecompute) {
      const { error: rpcErr } = await supabaseAdmin.rpc("recompute_recipe_cost", {
        _recipe_id: recipeId,
      });
      if (rpcErr) {
        warnings.push(`recompute_recipe_cost failed for ${recipeId}: ${rpcErr.message}`);
      } else {
        recipes_recomputed++;
      }
    }

    return {
      merged_count: data.losing_ids.length,
      prices_repointed,
      history_repointed,
      audit_repointed,
      aliases_added,
      references_repointed,
      recipe_links_repointed,
      inventory_items_consolidated,
      recipes_recomputed,
      warnings,
      canonical_inventory_pick: canonicalPickReport,
    };
  });

// ---------- PriceService ----------


export const peListPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [ingRes, priceRes] = await Promise.all([
      supabaseAdmin.from("pe_ingredients").select("id, canonical_name, base_unit, category"),
      supabaseAdmin.from("pe_ingredient_prices").select("*"),
    ]);
    if (ingRes.error) throw new Error(ingRes.error.message);
    if (priceRes.error) throw new Error(priceRes.error.message);
    const priceMap = new Map((priceRes.data ?? []).map((p) => [p.ingredient_id, p]));
    const now = Date.now();
    const rows = (ingRes.data ?? []).map((ing) => {
      const p = priceMap.get(ing.id);
      const ageDays = p?.last_updated
        ? (now - new Date(p.last_updated).getTime()) / 86_400_000
        : null;
      return {
        ingredient: ing,
        price: p ?? null,
        is_stale: ageDays != null && ageDays > STALE_AFTER_DAYS,
        age_days: ageDays,
      };
    });
    return { rows };
  });

async function refreshOne(ingredientId: string, canonicalName: string, baseUnit: string, userId: string) {
  try {
    const { raw } = await fetchGroceryPrice(canonicalName);
    const candidates = discoverPrices(raw);
    const best = candidates[0] ?? null;

    if (!best) {
      await supabaseAdmin.from("pe_ingredient_prices").upsert({
        ingredient_id: ingredientId,
        status: "price_missing",
        raw_sample_json: raw as any,
        discovered_field_path: null,
        confidence_score: 0,
        last_updated: new Date().toISOString(),
        last_error: "No plausible price field discovered",
        is_manual_override: false,
        source: "grocery_pricing_api",
      });
      return { ok: false, reason: "no_price" };
    }

    // Normalize to base unit if a unit hint exists; otherwise assume the price
    // is already per the ingredient's base unit (best-effort, conservative).
    let pricePerBase = best.value;
    if (best.unitHint) {
      const conv = convertQty(1, baseUnit, best.unitHint);
      // If 1 baseUnit = `conv` of unitHint, then price/baseUnit = price * conv
      if (conv != null) pricePerBase = best.value * conv;
    }

    const confidence = confidenceFromScore(best.score, candidates.length);

    const updateRow = {
      ingredient_id: ingredientId,
      price_per_base_unit: pricePerBase,
      currency: "USD",
      source: "grocery_pricing_api",
      raw_sample_json: raw as any,
      discovered_field_path: best.path,
      confidence_score: confidence,
      is_manual_override: false,
      override_note: null,
      status: "ok" as const,
      last_error: null,
      last_updated: new Date().toISOString(),
    };
    const { error: upErr } = await supabaseAdmin.from("pe_ingredient_prices").upsert(updateRow);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("pe_price_history").insert({
      ingredient_id: ingredientId,
      price_per_base_unit: pricePerBase,
      currency: "USD",
      source: "grocery_pricing_api",
      discovered_field_path: best.path,
      confidence_score: confidence,
      is_manual_override: false,
      changed_by: userId,
    });

    return { ok: true, price: pricePerBase, path: best.path, confidence };
  } catch (e: any) {
    await supabaseAdmin.from("pe_ingredient_prices").upsert({
      ingredient_id: ingredientId,
      status: "error",
      last_error: e?.message ?? String(e),
      last_updated: new Date().toISOString(),
      source: "grocery_pricing_api",
    });
    return { ok: false, reason: "error", error: e?.message };
  }
}

export const peRefreshPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      ingredient_ids: z.array(z.string().uuid()).max(100).optional(),
      force: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: ingredients, error } = await supabaseAdmin
      .from("pe_ingredients")
      .select("id, canonical_name, base_unit")
      .order("canonical_name");
    if (error) throw new Error(error.message);

    const targetIds = new Set(data.ingredient_ids ?? []);
    const targets = (ingredients ?? []).filter(
      (i) => targetIds.size === 0 || targetIds.has(i.id),
    );

    const results: Array<{ ingredient_id: string; ok: boolean; reason?: string; error?: string }> = [];
    for (const ing of targets) {
      const r = await refreshOne(ing.id, ing.canonical_name, ing.base_unit, context.userId);
      results.push({ ingredient_id: ing.id, ...r });
    }
    return { processed: results.length, results };
  });

const overrideSchema = z.object({
  ingredient_id: z.string().uuid(),
  price_per_base_unit: z.number().positive().max(99999),
  note: z.string().min(3).max(500),
});

export const peManualOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: prev } = await supabaseAdmin
      .from("pe_ingredient_prices")
      .select("price_per_base_unit")
      .eq("ingredient_id", data.ingredient_id)
      .maybeSingle();

    const { error: upErr } = await supabaseAdmin.from("pe_ingredient_prices").upsert({
      ingredient_id: data.ingredient_id,
      price_per_base_unit: data.price_per_base_unit,
      currency: "USD",
      source: "manual_override",
      is_manual_override: true,
      override_note: data.note,
      status: "ok",
      last_error: null,
      last_updated: new Date().toISOString(),
    });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("pe_price_history").insert({
      ingredient_id: data.ingredient_id,
      price_per_base_unit: data.price_per_base_unit,
      currency: "USD",
      source: "manual_override",
      is_manual_override: true,
      override_note: data.note,
      changed_by: context.userId,
    });

    await supabaseAdmin.from("pe_price_overrides_audit").insert({
      ingredient_id: data.ingredient_id,
      previous_price: prev?.price_per_base_unit ?? null,
      new_price: data.price_per_base_unit,
      note: data.note,
      admin_user_id: context.userId,
    });
    return { ok: true };
  });

export const peGetPriceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ingredient_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("pe_price_history")
      .select("*")
      .eq("ingredient_id", data.ingredient_id)
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });

export const peStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: prices, error } = await supabaseAdmin
      .from("pe_ingredient_prices")
      .select("status, last_updated, confidence_score, is_manual_override");
    if (error) throw new Error(error.message);

    const { count: ingredientCount } = await supabaseAdmin
      .from("pe_ingredients")
      .select("*", { count: "exact", head: true });

    const now = Date.now();
    const stats = {
      total_ingredients: ingredientCount ?? 0,
      priced: 0,
      missing: 0,
      errored: 0,
      stale: 0,
      manual: 0,
      avg_confidence: 0,
      api_key_configured: !!process.env.RAPIDAPI_KEY,
    };
    let confSum = 0; let confN = 0;
    for (const p of prices ?? []) {
      if (p.status === "ok") stats.priced++;
      if (p.status === "price_missing") stats.missing++;
      if (p.status === "error") stats.errored++;
      if (p.is_manual_override) stats.manual++;
      const ageDays = p.last_updated
        ? (now - new Date(p.last_updated).getTime()) / 86_400_000
        : null;
      if (ageDays != null && ageDays > STALE_AFTER_DAYS) stats.stale++;
      if (p.confidence_score != null) { confSum += Number(p.confidence_score); confN++; }
    }
    stats.avg_confidence = confN > 0 ? Math.round((confSum / confN) * 1000) / 1000 : 0;
    stats.missing += Math.max(0, (ingredientCount ?? 0) - (prices?.length ?? 0));

    return { stats };
  });

// ---------- RecipeCostService ----------

const recipeCostSchema = z.object({
  servings: z.number().int().positive().max(10000),
  ingredients: z
    .array(
      z.object({
        ingredient_id: z.string().uuid(),
        quantity: z.number().positive().max(99999),
        unit: z.string().min(1).max(32),
      }),
    )
    .min(1)
    .max(200),
});

export const peComputeRecipeCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recipeCostSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ids = data.ingredients.map((i) => i.ingredient_id);

    const [ingRes, priceRes] = await Promise.all([
      supabaseAdmin.from("pe_ingredients").select("id, canonical_name, base_unit").in("id", ids),
      supabaseAdmin.from("pe_ingredient_prices").select("*").in("ingredient_id", ids),
    ]);
    if (ingRes.error) throw new Error(ingRes.error.message);
    if (priceRes.error) throw new Error(priceRes.error.message);

    const ingMap = new Map((ingRes.data ?? []).map((r) => [r.id, r]));
    const priceMap = new Map((priceRes.data ?? []).map((r) => [r.ingredient_id, r]));

    const lines: Array<{
      ingredient_id: string;
      canonical_name: string | null;
      quantity: number;
      unit: string;
      base_unit: string | null;
      quantity_in_base_unit: number | null;
      price_per_base_unit: number | null;
      line_cost: number | null;
      missing_reason: string | null;
    }> = [];

    let total = 0;
    let anyMissing = false;
    for (const item of data.ingredients) {
      const ing = ingMap.get(item.ingredient_id);
      const price = priceMap.get(item.ingredient_id);
      let qtyBase: number | null = null;
      let lineCost: number | null = null;
      let missing: string | null = null;

      if (!ing) missing = "ingredient_not_found";
      else if (!price || price.price_per_base_unit == null) missing = "price_missing";
      else {
        qtyBase = convertQty(item.quantity, item.unit, ing.base_unit);
        if (qtyBase == null) missing = `cannot_convert_${item.unit}_to_${ing.base_unit}`;
        else {
          lineCost = qtyBase * Number(price.price_per_base_unit);
          total += lineCost;
        }
      }

      if (missing) anyMissing = true;
      lines.push({
        ingredient_id: item.ingredient_id,
        canonical_name: ing?.canonical_name ?? null,
        quantity: item.quantity,
        unit: item.unit,
        base_unit: ing?.base_unit ?? null,
        quantity_in_base_unit: qtyBase,
        price_per_base_unit: price?.price_per_base_unit != null ? Number(price.price_per_base_unit) : null,
        line_cost: lineCost,
        missing_reason: missing,
      });
    }

    return {
      lines,
      recipe_cost: anyMissing ? null : Math.round(total * 100) / 100,
      cost_per_person: anyMissing ? null : Math.round((total / data.servings) * 100) / 100,
      servings: data.servings,
      complete: !anyMissing,
    };
  });

// ---------- CSV Import ----------
// Accepted columns (case-insensitive, header row required):
//   ingredient (required)        — canonical name OR alias
//   price (required)             — numeric, USD
//   unit (optional)              — unit the price is per (e.g. lb, oz, kg, each).
//                                  If omitted, price is assumed to already be per ingredient base unit.
//   note (optional)              — audit note (defaults to "CSV import <timestamp>")

const csvImportSchema = z.object({
  rows: z
    .array(
      z.object({
        ingredient: z.string().min(1).max(200),
        price: z.number().positive().max(99999),
        unit: z.string().max(32).optional().nullable(),
        note: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(2000),
  default_note: z.string().max(500).optional(),
  dry_run: z.boolean().optional(),
});

type CsvImportResultRow = {
  input_ingredient: string;
  input_price: number;
  input_unit: string | null;
  matched_ingredient_id: string | null;
  matched_canonical_name: string | null;
  base_unit: string | null;
  price_per_base_unit: number | null;
  status: "ok" | "not_found" | "ambiguous" | "bad_unit" | "error";
  message: string | null;
};

export const peImportPricesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => csvImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { ensureUnitSynonymsLoaded } = await import("@/lib/server/pricing-engine/load-synonyms");
    await ensureUnitSynonymsLoaded();

    // Build lookup maps once
    const [ingRes, aliasRes] = await Promise.all([
      supabaseAdmin.from("pe_ingredients").select("id, canonical_name, base_unit"),
      supabaseAdmin.from("pe_ingredient_aliases").select("ingredient_id, alias"),
    ]);
    if (ingRes.error) throw new Error(ingRes.error.message);
    if (aliasRes.error) throw new Error(aliasRes.error.message);

    const byCanonical = new Map<string, { id: string; canonical_name: string; base_unit: string }>();
    for (const ing of ingRes.data ?? []) {
      byCanonical.set(ing.canonical_name.toLowerCase().trim(), ing);
    }
    const byAlias = new Map<string, string>(); // alias -> ingredient_id
    for (const a of aliasRes.data ?? []) {
      byAlias.set(a.alias.toLowerCase().trim(), a.ingredient_id);
    }
    const ingById = new Map((ingRes.data ?? []).map((i) => [i.id, i]));

    const results: CsvImportResultRow[] = [];
    const toUpsert: any[] = [];
    const toHistory: any[] = [];
    const toAudit: any[] = [];
    const defaultNote = data.default_note?.trim() || `CSV import ${new Date().toISOString()}`;

    // Cache previous prices to populate audit "previous_price" column
    const previousPriceMap = new Map<string, number | null>();
    {
      const ids = (ingRes.data ?? []).map((i) => i.id);
      if (ids.length > 0) {
        const { data: prev } = await supabaseAdmin
          .from("pe_ingredient_prices")
          .select("ingredient_id, price_per_base_unit")
          .in("ingredient_id", ids);
        for (const p of prev ?? []) {
          previousPriceMap.set(
            p.ingredient_id,
            p.price_per_base_unit != null ? Number(p.price_per_base_unit) : null,
          );
        }
      }
    }

    for (const row of data.rows) {
      const key = row.ingredient.toLowerCase().trim();
      const direct = byCanonical.get(key);
      const aliasId = byAlias.get(key);
      const ing = direct ?? (aliasId ? ingById.get(aliasId) : undefined);

      if (!ing) {
        results.push({
          input_ingredient: row.ingredient,
          input_price: row.price,
          input_unit: row.unit ?? null,
          matched_ingredient_id: null,
          matched_canonical_name: null,
          base_unit: null,
          price_per_base_unit: null,
          status: "not_found",
          message: "No canonical ingredient or alias matched. Add it on the Ingredients tab first.",
        });
        continue;
      }

      // Convert price to per-base-unit if a source unit is provided.
      // If the user gives "$2.50/lb" and base_unit is "oz", we need price per oz:
      //   price_per_base = price_per_unit × (1 unit_in_base_units)^-1
      //   (1 of unit  ->  X of base)  =>  price/base = price/unit * (unit/base)
      //   Easier: 1 base_unit = convertQty(1, base_unit, unit) of unit
      //           => price_per_base = price_per_unit * convertQty(1, base_unit, unit)
      let pricePerBase = row.price;
      if (row.unit && row.unit.trim().length > 0) {
        const conv = convertQty(1, ing.base_unit, row.unit.trim());
        if (conv == null) {
          results.push({
            input_ingredient: row.ingredient,
            input_price: row.price,
            input_unit: row.unit,
            matched_ingredient_id: ing.id,
            matched_canonical_name: ing.canonical_name,
            base_unit: ing.base_unit,
            price_per_base_unit: null,
            status: "bad_unit",
            message: `Cannot convert ${row.unit} → ${ing.base_unit} (different dimension).`,
          });
          continue;
        }
        pricePerBase = row.price * conv;
      }

      const note = row.note?.trim() || defaultNote;
      const nowIso = new Date().toISOString();

      toUpsert.push({
        ingredient_id: ing.id,
        price_per_base_unit: pricePerBase,
        currency: "USD",
        source: "csv_import",
        is_manual_override: true,
        override_note: note,
        status: "ok",
        last_error: null,
        last_updated: nowIso,
      });
      toHistory.push({
        ingredient_id: ing.id,
        price_per_base_unit: pricePerBase,
        currency: "USD",
        source: "csv_import",
        is_manual_override: true,
        override_note: note,
        changed_by: context.userId,
      });
      toAudit.push({
        ingredient_id: ing.id,
        previous_price: previousPriceMap.get(ing.id) ?? null,
        new_price: pricePerBase,
        note,
        admin_user_id: context.userId,
      });

      results.push({
        input_ingredient: row.ingredient,
        input_price: row.price,
        input_unit: row.unit ?? null,
        matched_ingredient_id: ing.id,
        matched_canonical_name: ing.canonical_name,
        base_unit: ing.base_unit,
        price_per_base_unit: pricePerBase,
        status: "ok",
        message: null,
      });
    }

    if (!data.dry_run && toUpsert.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("pe_ingredient_prices")
        .upsert(toUpsert);
      if (upErr) throw new Error(`Price upsert failed: ${upErr.message}`);

      const { error: histErr } = await supabaseAdmin
        .from("pe_price_history")
        .insert(toHistory);
      if (histErr) throw new Error(`History insert failed: ${histErr.message}`);

      const { error: auditErr } = await supabaseAdmin
        .from("pe_price_overrides_audit")
        .insert(toAudit);
      if (auditErr) throw new Error(`Audit insert failed: ${auditErr.message}`);
    }

    const summary = {
      total: results.length,
      applied: data.dry_run ? 0 : toUpsert.length,
      ok: results.filter((r) => r.status === "ok").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      bad_unit: results.filter((r) => r.status === "bad_unit").length,
      dry_run: !!data.dry_run,
    };
    return { summary, results };
  });

// ---------- Overview ----------

export const peOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // Stats (mirrors peStatus)
    const { data: prices } = await supabaseAdmin
      .from("pe_ingredient_prices")
      .select("status, last_updated, confidence_score, is_manual_override");
    const { count: ingredientCount } = await supabaseAdmin
      .from("pe_ingredients")
      .select("*", { count: "exact", head: true });

    const now = Date.now();
    const stats = {
      total_ingredients: ingredientCount ?? 0,
      priced: 0,
      missing: 0,
      errored: 0,
      stale: 0,
      manual: 0,
      avg_confidence: 0,
      api_key_configured: !!process.env.RAPIDAPI_KEY,
    };
    let confSum = 0;
    let confN = 0;
    for (const p of prices ?? []) {
      if (p.status === "ok") stats.priced++;
      if (p.status === "price_missing") stats.missing++;
      if (p.status === "error") stats.errored++;
      if (p.is_manual_override) stats.manual++;
      const ageDays = p.last_updated
        ? (now - new Date(p.last_updated).getTime()) / 86_400_000
        : null;
      if (ageDays != null && ageDays > STALE_AFTER_DAYS) stats.stale++;
      if (p.confidence_score != null) {
        confSum += Number(p.confidence_score);
        confN++;
      }
    }
    stats.avg_confidence = confN > 0 ? Math.round((confSum / confN) * 1000) / 1000 : 0;
    stats.missing += Math.max(0, (ingredientCount ?? 0) - (prices?.length ?? 0));

    // Last CSV import — most recent history row sourced from csv_import
    const { data: lastCsvRows } = await supabaseAdmin
      .from("pe_price_history")
      .select("recorded_at, changed_by")
      .eq("source", "csv_import")
      .order("recorded_at", { ascending: false })
      .limit(1);
    const lastCsv = lastCsvRows?.[0] ?? null;

    let csvBatchCount = 0;
    if (lastCsv?.recorded_at) {
      // Count rows imported within ±2 minutes of the last import (approx batch)
      const ts = new Date(lastCsv.recorded_at).getTime();
      const start = new Date(ts - 120_000).toISOString();
      const end = new Date(ts + 120_000).toISOString();
      const { count } = await supabaseAdmin
        .from("pe_price_history")
        .select("*", { count: "exact", head: true })
        .eq("source", "csv_import")
        .gte("recorded_at", start)
        .lte("recorded_at", end);
      csvBatchCount = count ?? 0;
    }

    // Recent price changes — last 10 across all sources, joined with ingredient name
    const { data: recentRaw } = await supabaseAdmin
      .from("pe_price_history")
      .select(
        "id, ingredient_id, price_per_base_unit, currency, source, is_manual_override, recorded_at",
      )
      .order("recorded_at", { ascending: false })
      .limit(10);
    const ids = Array.from(new Set((recentRaw ?? []).map((r) => r.ingredient_id)));
    let nameMap = new Map<string, { name: string; base_unit: string }>();
    if (ids.length > 0) {
      const { data: ings } = await supabaseAdmin
        .from("pe_ingredients")
        .select("id, canonical_name, base_unit")
        .in("id", ids);
      nameMap = new Map((ings ?? []).map((i) => [i.id, { name: i.canonical_name, base_unit: i.base_unit }]));
    }
    const recent = (recentRaw ?? []).map((r) => ({
      ...r,
      ingredient_name: nameMap.get(r.ingredient_id)?.name ?? "(unknown)",
      base_unit: nameMap.get(r.ingredient_id)?.base_unit ?? "",
    }));

    return {
      stats,
      last_csv_import: lastCsv
        ? { recorded_at: lastCsv.recorded_at, batch_count: csvBatchCount }
        : null,
      recent_changes: recent,
    };
  });

// ---------- Match Settings ----------

const matchSettingsSchema = z.object({
  link_threshold: z.number().min(0).max(1),
  auto_merge_threshold: z.number().min(0).max(1),
  ignore_tokens: z.array(z.string().min(1).max(40)).max(200),
  require_unit_match: z.boolean(),
  use_ai_default: z.boolean(),
}).refine((v) => v.auto_merge_threshold >= v.link_threshold, {
  message: "Auto-merge threshold must be ≥ link threshold",
  path: ["auto_merge_threshold"],
});

export const peGetMatchSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("pe_match_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: data ?? {
        id: 1,
        link_threshold: 0.7,
        auto_merge_threshold: 0.85,
        ignore_tokens: DEFAULT_IGNORE_TOKENS,
        require_unit_match: true,
        use_ai_default: true,
      },
      defaults: {
        ignore_tokens: DEFAULT_IGNORE_TOKENS,
      },
    };
  });

export const peSaveMatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => matchSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Normalize tokens: lowercase, trim, dedupe.
    const tokens = Array.from(
      new Set(
        data.ignore_tokens
          .map((t) => t.toLowerCase().trim())
          .filter((t) => t.length > 0),
      ),
    );
    const { data: row, error } = await supabaseAdmin
      .from("pe_match_settings")
      .upsert({
        id: 1,
        link_threshold: data.link_threshold,
        auto_merge_threshold: data.auto_merge_threshold,
        ignore_tokens: tokens,
        require_unit_match: data.require_unit_match,
        use_ai_default: data.use_ai_default,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, settings: row };
  });
