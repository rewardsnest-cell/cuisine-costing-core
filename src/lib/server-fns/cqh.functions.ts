// Competitor Quote Hub server functions.
// Admin-only. RLS enforces access via has_role('admin').
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPost, AiGatewayError } from "./_ai-gateway";

// ---------- Types returned to client ----------
export type CqhEvent = {
  id: string;
  name: string;
  event_date: string | null;
  guest_count: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CqhDocument = {
  id: string;
  event_id: string;
  filename: string;
  file_type: string;
  storage_path: string | null;
  extracted_text: string | null;
  created_at: string;
};

export type CqhDish = {
  id: string;
  event_id: string;
  name: string;
  source_documents: string[];
  is_main: boolean;
  merged_from: string[];
  source_qty: number | null;
  source_unit: string | null;
  source_unit_price: number | null;
  source_line_total: number | null;
  source_category: string | null;
  source_notes: string | null;
  source_raw: string | null;
};

export type CqhShoppingList = {
  id: string;
  event_id: string;
  revision_number: number;
  status: string; // draft | approved
  approved_at: string | null;
  generated_by_ai: boolean;
};

export type CqhShoppingListItem = {
  id: string;
  shopping_list_id: string;
  dish_id: string | null;
  ingredient_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  per_dish_allocation: Record<string, number>;
  notes: string | null;
};

// ---------- Events ----------

export const listCqhEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cqh_events")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { events: (data ?? []) as CqhEvent[] };
  });

export const createCqhEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; event_date?: string | null; guest_count?: number | null }) => {
    if (!input?.name?.trim()) throw new Error("Event name is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cqh_events")
      .insert({
        name: data.name.trim(),
        event_date: data.event_date || null,
        guest_count: data.guest_count ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { event: row as CqhEvent };
  });

export const getCqhEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [eventRes, docsRes, dishesRes, listsRes, auditRes] = await Promise.all([
      supabase.from("cqh_events").select("*").eq("id", data.id).single(),
      supabase.from("cqh_documents").select("*").eq("event_id", data.id).order("created_at"),
      supabase.from("cqh_dishes").select("*").eq("event_id", data.id).order("created_at"),
      supabase.from("cqh_shopping_lists").select("*").eq("event_id", data.id).order("revision_number", { ascending: false }),
      supabase.from("cqh_audit_log").select("*").eq("event_id", data.id).order("created_at", { ascending: false }).limit(200),
    ]);

    if (eventRes.error) throw new Error(eventRes.error.message);

    const lists = (listsRes.data ?? []) as CqhShoppingList[];
    const currentList = lists[0] ?? null;
    let items: CqhShoppingListItem[] = [];
    if (currentList) {
      const { data: itemRows, error: itemErr } = await supabase
        .from("cqh_shopping_list_items")
        .select("*")
        .eq("shopping_list_id", currentList.id)
        .order("ingredient_name");
      if (itemErr) throw new Error(itemErr.message);
      items = (itemRows ?? []) as CqhShoppingListItem[];
    }

    const { data: quoteRows } = await supabase
      .from("quotes")
      .select("id,reference_number,status,quote_state,total,guest_count,created_at,superseded_by,cqh_shopping_list_id")
      .eq("cqh_event_id", data.id)
      .order("created_at", { ascending: false });

    return {
      event: eventRes.data as CqhEvent,
      documents: (docsRes.data ?? []) as CqhDocument[],
      dishes: (dishesRes.data ?? []) as CqhDish[],
      shoppingLists: lists,
      currentList,
      items,
      auditLog: auditRes.data ?? [],
      quotes: quoteRows ?? [],
    };
  });

export const updateCqhEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string; event_date?: string | null; guest_count?: number | null }) => input)
  .handler(async ({ data, context }) => {
    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.event_date !== undefined) patch.event_date = data.event_date || null;
    if (data.guest_count !== undefined) patch.guest_count = data.guest_count ?? null;
    const { error } = await (context.supabase.from("cqh_events") as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Documents ----------

export const addCqhDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    event_id: string;
    filename: string;
    file_type: string;
    storage_path?: string | null;
    extracted_text?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cqh_documents")
      .insert({
        event_id: data.event_id,
        filename: data.filename,
        file_type: data.file_type,
        storage_path: data.storage_path ?? null,
        extracted_text: data.extracted_text ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("cqh_audit_log").insert({
      event_id: data.event_id,
      action: "documents_uploaded",
      payload: { filename: data.filename, file_type: data.file_type },
      actor_id: context.userId,
    });
    return { document: row as CqhDocument };
  });

export const removeCqhDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("cqh_documents").select("event_id,storage_path,filename").eq("id", data.id).single();
    if (doc?.storage_path) {
      await context.supabase.storage.from("cqh-documents").remove([doc.storage_path]).catch(() => {});
    }
    const { error } = await context.supabase.from("cqh_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (doc) {
      await context.supabase.from("cqh_audit_log").insert({
        event_id: doc.event_id,
        action: "document_removed",
        payload: { filename: doc.filename },
        actor_id: context.userId,
      });
    }
    return { ok: true };
  });

// ---------- Dishes ----------

export const addCqhDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_id: string; name: string; is_main?: boolean; source_documents?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cqh_dishes")
      .insert({
        event_id: data.event_id,
        name: data.name.trim(),
        is_main: !!data.is_main,
        source_documents: data.source_documents ?? [],
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return { dish: row as CqhDish };
  });

export const updateCqhDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string; is_main?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.is_main !== undefined) patch.is_main = data.is_main;
    const { error } = await (context.supabase.from("cqh_dishes") as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("cqh_audit_log").insert({
      action: "dish_updated", payload: { id: data.id, ...patch }, actor_id: context.userId,
    });
    return { ok: true };
  });

export const deleteCqhDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cqh_dishes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const mergeCqhDishes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { keep_id: string; merge_ids: string[]; new_name?: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: keep } = await supabase.from("cqh_dishes").select("*").eq("id", data.keep_id).single();
    if (!keep) throw new Error("Dish to keep not found");
    const { data: others } = await supabase.from("cqh_dishes").select("*").in("id", data.merge_ids);
    const allSources = new Set<string>([...(keep.source_documents ?? [])]);
    const mergedFrom = new Set<string>([...(keep.merged_from ?? [])]);
    for (const d of others ?? []) {
      (d.source_documents ?? []).forEach((s: string) => allSources.add(s));
      mergedFrom.add(d.id);
    }
    await supabase.from("cqh_dishes").update({
      name: data.new_name?.trim() || keep.name,
      source_documents: Array.from(allSources),
      merged_from: Array.from(mergedFrom),
    }).eq("id", data.keep_id);
    if (data.merge_ids.length) {
      await supabase.from("cqh_dishes").delete().in("id", data.merge_ids);
    }
    await supabase.from("cqh_audit_log").insert({
      event_id: keep.event_id,
      action: "dishes_merged_or_renamed",
      payload: { keep_id: data.keep_id, merge_ids: data.merge_ids, new_name: data.new_name ?? null },
      actor_id: context.userId,
    });
    return { ok: true };
  });

// ---------- AI: extract dishes from documents ----------

const DISHES_SYSTEM = `You extract dish/menu items from a competitor catering proposal, menu, or pricing spreadsheet.

Return ONLY valid JSON of this shape:
{
  "dishes": [{
    "name": string,
    "is_main": boolean,
    "qty": number | null,
    "unit": string | null,
    "unit_price": number | null,
    "line_total": number | null,
    "category": string | null,
    "notes": string | null,
    "raw": string | null
  }]
}

Rules:
- "name" should be a concise dish name a chef would recognize (e.g. "Grilled Salmon", "Caesar Salad").
- Skip pricing-only summary rows, headers, dates, intros, and non-food rows (linens, service charges, gratuity, taxes, delivery).
- Mark is_main=true ONLY for clear entrée/main items. Sides/salads/apps/desserts are false.
- Spreadsheets often have columns for qty, unit (ea/lb/tray/dozen), unit price, and line total — capture those numerically into "qty", "unit", "unit_price", "line_total". Strip currency symbols, keep numbers as numbers.
- "category" = the section header the row sits under (Appetizers, Mains, Sides, Desserts, Beverages, etc.) when detectable.
- "notes" = any short modifier on the row (e.g. "GF", "vegan option", "served family-style").
- "raw" = the original row/line as it appears in the source, trimmed.
- If a field is unknown, use null. Do NOT invent prices or quantities.
- Deduplicate within a document by name.`;

type ExtractedDish = {
  name: string;
  is_main: boolean;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  category: string | null;
  notes: string | null;
  raw: string | null;
  source_documents: string[];
};

function richness(d: ExtractedDish): number {
  let n = 0;
  if (d.qty != null) n++;
  if (d.unit) n++;
  if (d.unit_price != null) n++;
  if (d.line_total != null) n++;
  if (d.category) n++;
  if (d.notes) n++;
  if (d.raw) n++;
  return n;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export const extractDishesFromDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: docs, error } = await supabase
      .from("cqh_documents").select("id,filename,extracted_text").eq("event_id", data.event_id);
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) return { added: 0, dishes: [] };

    const allFound: ExtractedDish[] = [];
    for (const doc of docs) {
      const text = (doc.extracted_text ?? "").trim();
      if (!text) continue;
      try {
        const resp = await aiPost({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: DISHES_SYSTEM },
            { role: "user", content: `Document: ${doc.filename}\n\n---\n${text.slice(0, 60000)}` },
          ],
          response_format: { type: "json_object" },
        });
        const j = await resp.json();
        const content = j.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(content);
        for (const d of parsed.dishes ?? []) {
          if (typeof d?.name === "string" && d.name.trim()) {
            allFound.push({
              name: d.name.trim(),
              is_main: !!d.is_main,
              qty: toNum(d.qty),
              unit: toStr(d.unit),
              unit_price: toNum(d.unit_price),
              line_total: toNum(d.line_total),
              category: toStr(d.category),
              notes: toStr(d.notes),
              raw: toStr(d.raw),
              source_documents: [doc.id],
            });
          }
        }
      } catch (e) {
        if (e instanceof AiGatewayError) {
          return { added: 0, dishes: [], error: e.message, status: e.status };
        }
        console.error("dish extract failed for doc", doc.id, e);
      }
    }

    // Deduplicate by lowercased name across docs — keep the richest record.
    const byKey = new Map<string, ExtractedDish>();
    for (const d of allFound) {
      const k = d.name.toLowerCase();
      const existing = byKey.get(k);
      if (!existing) {
        byKey.set(k, { ...d });
        continue;
      }
      const merged: ExtractedDish = richness(d) > richness(existing) ? { ...d } : { ...existing };
      merged.is_main = existing.is_main || d.is_main;
      merged.source_documents = Array.from(new Set([...existing.source_documents, ...d.source_documents]));
      // Fill any missing field from the other record.
      merged.qty ??= existing.qty ?? d.qty;
      merged.unit ??= existing.unit ?? d.unit;
      merged.unit_price ??= existing.unit_price ?? d.unit_price;
      merged.line_total ??= existing.line_total ?? d.line_total;
      merged.category ??= existing.category ?? d.category;
      merged.notes ??= existing.notes ?? d.notes;
      merged.raw ??= existing.raw ?? d.raw;
      byKey.set(k, merged);
    }

    // Avoid re-adding dishes that already exist (case-insensitive name match).
    const { data: existingDishes } = await supabase
      .from("cqh_dishes").select("name").eq("event_id", data.event_id);
    const existingSet = new Set((existingDishes ?? []).map((d: any) => d.name.toLowerCase()));

    const toInsert = Array.from(byKey.values())
      .filter((d) => !existingSet.has(d.name.toLowerCase()))
      .map((d) => ({
        event_id: data.event_id,
        name: d.name,
        is_main: d.is_main,
        source_documents: d.source_documents,
        source_qty: d.qty,
        source_unit: d.unit,
        source_unit_price: d.unit_price,
        source_line_total: d.line_total,
        source_category: d.category,
        source_notes: d.notes,
        source_raw: d.raw,
      }));

    if (toInsert.length) {
      const { error: insErr } = await supabase.from("cqh_dishes").insert(toInsert);
      if (insErr) throw new Error(insErr.message);
    }

    await supabase.from("cqh_audit_log").insert({
      event_id: data.event_id,
      action: "dishes_extracted",
      payload: { added: toInsert.length, total_found: byKey.size },
      actor_id: context.userId,
    });

    return { added: toInsert.length, dishes: toInsert };
  });

// ---------- AI: Generate Shopping List ----------

const SHOPPING_SYSTEM = `You are a catering sous-chef. Given a list of dishes for an event, produce a per-dish ingredient list and a recommended quantity for each ingredient scaled to the guest count.

Return ONLY valid JSON:
{
  "dishes": [
    {
      "dish_name": string,
      "ingredients": [
        { "ingredient_name": string, "quantity": number, "unit": string, "notes": string | null }
      ]
    }
  ]
}

Rules:
- Use realistic catering quantities for the given guest count. If guest count is unknown assume 50.
- Use common kitchen units: lb, oz, ea, gal, qt, cup, tbsp, tsp, bunch, head, can, jar.
- Round quantities to one decimal place where appropriate.
- Ingredient names must be normalized (e.g. "Yellow Onion" not "onions, yellow, raw").
- DO NOT invent prices. DO NOT include service items, labor, or gratuity.`;

export const generateShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: ev } = await supabase.from("cqh_events").select("*").eq("id", data.event_id).single();
    if (!ev) throw new Error("Event not found");
    const { data: dishes } = await supabase.from("cqh_dishes").select("id,name,is_main").eq("event_id", data.event_id);
    if (!dishes || dishes.length === 0) {
      throw new Error("Add at least one dish before generating a shopping list.");
    }

    const guests = ev.guest_count ?? 50;
    const dishLines = dishes.map((d: any) => `- ${d.name}${d.is_main ? " (MAIN)" : ""}`).join("\n");
    const userPrompt = `Event: ${ev.name}\nGuests: ${guests}\n\nDishes:\n${dishLines}`;

    let parsed: any;
    try {
      const resp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SHOPPING_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      const j = await resp.json();
      parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    } catch (e) {
      if (e instanceof AiGatewayError) {
        throw new Error(e.message);
      }
      throw e;
    }

    // Determine next revision number.
    const { data: existing } = await supabase
      .from("cqh_shopping_lists")
      .select("revision_number")
      .eq("event_id", data.event_id)
      .order("revision_number", { ascending: false })
      .limit(1);
    const nextRev = ((existing?.[0]?.revision_number as number) ?? 0) + 1;

    const { data: list, error: listErr } = await supabase
      .from("cqh_shopping_lists")
      .insert({
        event_id: data.event_id,
        revision_number: nextRev,
        status: "draft",
        generated_by_ai: true,
      })
      .select("*").single();
    if (listErr) throw new Error(listErr.message);

    // Map dish names back to dish ids.
    const dishByName = new Map<string, string>();
    for (const d of dishes) dishByName.set(d.name.toLowerCase(), d.id);

    // Normalize ingredient names so "Olive Oil", "olive oil", "olive oils" combine.
    const normalizeName = (raw: string): string => {
      let s = raw.toLowerCase().trim();
      s = s.replace(/[\s\-_/]+/g, " ");        // collapse whitespace + separators
      s = s.replace(/[^\p{L}\p{N} ]+/gu, "");  // strip punctuation
      // naive de-pluralization for the trailing word
      s = s.replace(/(\w+?)(es|s)\b/g, (_m, base, suffix) =>
        suffix === "es" && /(s|x|z|ch|sh)$/.test(base) ? base : base,
      );
      return s.trim();
    };

    // Unit conversion table — each alias maps to a canonical unit + multiplier.
    // Canonicals chosen for readability:
    //   weight → "oz"   (1 lb = 16 oz, 1 g ≈ 0.035274 oz, 1 kg ≈ 35.274 oz)
    //   volume → "tbsp" (1 cup = 16 tbsp, 1 tsp = 1/3 tbsp, 1 qt = 64 tbsp,
    //                     1 gal = 256 tbsp, 1 ml ≈ 0.067628 tbsp, 1 l ≈ 67.628 tbsp)
    //   count  → "ea"
    // Anything not in this table is treated as its own dimension (e.g. "bunch",
    // "can", "jar", "pkg") and only combines with the same literal unit.
    const UNIT_CONVERSIONS: Record<string, { canonical: string; factor: number }> = {
      // weight
      oz: { canonical: "oz", factor: 1 },
      ozs: { canonical: "oz", factor: 1 },
      ounce: { canonical: "oz", factor: 1 },
      ounces: { canonical: "oz", factor: 1 },
      lb: { canonical: "oz", factor: 16 },
      lbs: { canonical: "oz", factor: 16 },
      pound: { canonical: "oz", factor: 16 },
      pounds: { canonical: "oz", factor: 16 },
      g: { canonical: "oz", factor: 0.035274 },
      gram: { canonical: "oz", factor: 0.035274 },
      grams: { canonical: "oz", factor: 0.035274 },
      kg: { canonical: "oz", factor: 35.274 },
      kilogram: { canonical: "oz", factor: 35.274 },
      kilograms: { canonical: "oz", factor: 35.274 },
      // volume
      tbsp: { canonical: "tbsp", factor: 1 },
      tablespoon: { canonical: "tbsp", factor: 1 },
      tablespoons: { canonical: "tbsp", factor: 1 },
      tsp: { canonical: "tbsp", factor: 1 / 3 },
      teaspoon: { canonical: "tbsp", factor: 1 / 3 },
      teaspoons: { canonical: "tbsp", factor: 1 / 3 },
      cup: { canonical: "tbsp", factor: 16 },
      cups: { canonical: "tbsp", factor: 16 },
      qt: { canonical: "tbsp", factor: 64 },
      quart: { canonical: "tbsp", factor: 64 },
      quarts: { canonical: "tbsp", factor: 64 },
      gal: { canonical: "tbsp", factor: 256 },
      gallon: { canonical: "tbsp", factor: 256 },
      gallons: { canonical: "tbsp", factor: 256 },
      ml: { canonical: "tbsp", factor: 0.067628 },
      milliliter: { canonical: "tbsp", factor: 0.067628 },
      milliliters: { canonical: "tbsp", factor: 0.067628 },
      l: { canonical: "tbsp", factor: 67.628 },
      liter: { canonical: "tbsp", factor: 67.628 },
      liters: { canonical: "tbsp", factor: 67.628 },
      // count / piecewise (no conversion)
      ea: { canonical: "ea", factor: 1 },
      each: { canonical: "ea", factor: 1 },
      piece: { canonical: "ea", factor: 1 },
      pieces: { canonical: "ea", factor: 1 },
      pc: { canonical: "ea", factor: 1 },
      pcs: { canonical: "ea", factor: 1 },
    };
    const normalizeUnit = (raw: string | null | undefined): { unit: string | null; factor: number } => {
      if (!raw) return { unit: null, factor: 1 };
      const k = String(raw).toLowerCase().trim().replace(/\.$/, "");
      const conv = UNIT_CONVERSIONS[k];
      if (conv) return { unit: conv.canonical, factor: conv.factor };
      return { unit: k || null, factor: 1 };
    };

    // Aggregate items by normalized (ingredient_name, canonical unit). Quantities
    // are converted into the canonical unit before summing so e.g. 1 lb + 8 oz
    // collapses into a single 24 oz line.
    const aggregated = new Map<string, {
      ingredient_name: string;
      unit: string | null;
      quantity: number;
      per_dish_allocation: Record<string, number>;
      notes: string | null;
    }>();

    // Levenshtein distance + similarity ratio for fuzzy ingredient matching.
    // Catches OCR/spelling variants like "Tomatoe"/"Tomato", "Olive Oill"/"Olive Oil".
    const levenshtein = (a: string, b: string): number => {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;
      const prev = new Array<number>(b.length + 1);
      for (let j = 0; j <= b.length; j++) prev[j] = j;
      for (let i = 1; i <= a.length; i++) {
        let prevDiag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
          const tmp = prev[j];
          prev[j] = a[i - 1] === b[j - 1]
            ? prevDiag
            : 1 + Math.min(prevDiag, prev[j - 1], prev[j]);
          prevDiag = tmp;
        }
      }
      return prev[b.length];
    };
    const similarity = (a: string, b: string): number => {
      const max = Math.max(a.length, b.length);
      if (max === 0) return 1;
      return 1 - levenshtein(a, b) / max;
    };
    const FUZZY_THRESHOLD = 0.85;

    // Index keys by unit so we only fuzzy-compare within the same unit bucket.
    const keysByUnit = new Map<string, string[]>();
    const findFuzzyKey = (normName: string, unit: string | null): string | null => {
      const bucket = keysByUnit.get(unit ?? "") ?? [];
      let best: { key: string; score: number } | null = null;
      for (const key of bucket) {
        const otherName = key.split("::")[0];
        // Cheap guards: skip obvious non-matches before paying for Levenshtein.
        if (Math.abs(otherName.length - normName.length) > 4) continue;
        if (otherName[0] !== normName[0]) continue;
        const score = similarity(normName, otherName);
        if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
          best = { key, score };
        }
      }
      return best?.key ?? null;
    };

    for (const dishOut of parsed.dishes ?? []) {
      const dishId = dishByName.get(String(dishOut.dish_name ?? "").toLowerCase()) ?? null;
      for (const ing of dishOut.ingredients ?? []) {
        const rawName = String(ing.ingredient_name ?? "").trim();
        if (!rawName) continue;
        const normName = normalizeName(rawName);
        if (!normName) continue;
        const { unit, factor } = normalizeUnit(ing.unit);
        const qty = (Number(ing.quantity) || 0) * factor;
        const exactKey = `${normName}::${unit ?? ""}`;
        // Try exact match first, then fuzzy within the same unit bucket.
        const matchedKey = aggregated.has(exactKey)
          ? exactKey
          : findFuzzyKey(normName, unit);
        const existing = matchedKey ? aggregated.get(matchedKey) : undefined;
        if (existing && matchedKey) {
          existing.quantity += qty;
          if (dishId) existing.per_dish_allocation[dishId] = (existing.per_dish_allocation[dishId] ?? 0) + qty;
          // Prefer the longer / more descriptive display name.
          if (rawName.length > existing.ingredient_name.length) existing.ingredient_name = rawName;
          // Merge unique notes.
          if (ing.notes) {
            const note = String(ing.notes).trim();
            if (note && !(existing.notes ?? "").includes(note)) {
              existing.notes = existing.notes ? `${existing.notes}; ${note}` : note;
            }
          }
        } else {
          aggregated.set(exactKey, {
            ingredient_name: rawName,
            unit,
            quantity: qty,
            per_dish_allocation: dishId ? { [dishId]: qty } : {},
            notes: ing.notes ?? null,
          });
          const bucket = keysByUnit.get(unit ?? "") ?? [];
          bucket.push(exactKey);
          keysByUnit.set(unit ?? "", bucket);
        }
      }
    }

    // Round summed quantities with magnitude-aware precision so persisted
    // values don't carry floating-point noise from unit conversions
    // (e.g. lb→oz, ml→tbsp). Tier matches the client formatter in
    // src/lib/cqh/units.ts → roundQty().
    const roundForDisplay = (q: number, unit: string | null): number => {
      if (!Number.isFinite(q) || q === 0) return 0;
      if (unit === "ea") return Math.round(q);
      const abs = Math.abs(q);
      const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
      const f = 10 ** decimals;
      return Math.round(q * f) / f;
    };
    for (const a of aggregated.values()) {
      a.quantity = roundForDisplay(a.quantity, a.unit);
      for (const k of Object.keys(a.per_dish_allocation)) {
        a.per_dish_allocation[k] = roundForDisplay(a.per_dish_allocation[k], a.unit);
      }
    }




    const itemRows = Array.from(aggregated.values()).map((a) => ({
      shopping_list_id: list.id,
      ingredient_name: a.ingredient_name,
      quantity: a.quantity,
      unit: a.unit,
      unit_price: 0,
      per_dish_allocation: a.per_dish_allocation,
      notes: a.notes,
    }));

    if (itemRows.length) {
      const { error: insErr } = await supabase.from("cqh_shopping_list_items").insert(itemRows);
      if (insErr) throw new Error(insErr.message);
    }

    await supabase.from("cqh_events").update({ status: "shopping_list" }).eq("id", data.event_id);
    await supabase.from("cqh_audit_log").insert({
      event_id: data.event_id,
      shopping_list_id: list.id,
      action: "shopping_list_generated_by_ai",
      payload: { revision_number: nextRev, item_count: itemRows.length },
      actor_id: context.userId,
    });

    return { list: list as CqhShoppingList, item_count: itemRows.length };
  });

// ---------- Shopping list item edits ----------

export const upsertShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    shopping_list_id: string;
    ingredient_name: string;
    quantity: number;
    unit?: string | null;
    unit_price: number;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // Block structural edits on approved lists. Only unit_price (pricing) is allowed.
    const { data: list } = await supabase.from("cqh_shopping_lists").select("status").eq("id", data.shopping_list_id).single();
    if (!list) throw new Error("List not found");

    if (data.id) {
      const patch: Record<string, any> = { unit_price: data.unit_price };
      if (list.status === "draft") {
        patch.ingredient_name = data.ingredient_name;
        patch.quantity = data.quantity;
        patch.unit = data.unit ?? null;
        patch.notes = data.notes ?? null;
      }
      const { error } = await supabase.from("cqh_shopping_list_items").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      if (list.status !== "draft") throw new Error("Cannot add items to an approved list. Rebuild first.");
      const { error } = await supabase.from("cqh_shopping_list_items").insert({
        shopping_list_id: data.shopping_list_id,
        ingredient_name: data.ingredient_name,
        quantity: data.quantity,
        unit: data.unit ?? null,
        unit_price: data.unit_price,
        notes: data.notes ?? null,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; shopping_list_id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: list } = await supabase.from("cqh_shopping_lists").select("status").eq("id", data.shopping_list_id).single();
    if (list?.status !== "draft") throw new Error("Cannot delete items from an approved list.");
    const { error } = await supabase.from("cqh_shopping_list_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Approval / Rebuild ----------

export const approveShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { shopping_list_id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: list, error } = await supabase
      .from("cqh_shopping_lists")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: context.userId })
      .eq("id", data.shopping_list_id)
      .select("*").single();
    if (error) throw new Error(error.message);
    await supabase.from("cqh_events").update({ status: "approved" }).eq("id", list.event_id);
    await supabase.from("cqh_audit_log").insert({
      event_id: list.event_id,
      shopping_list_id: list.id,
      action: "shopping_list_approved",
      actor_id: context.userId,
    });
    return { list: list as CqhShoppingList };
  });

export const rebuildShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_id: string }) => input)
  .handler(async ({ data, context }) => {
    // Mark old quotes as superseded later when a new draft quote is created.
    await context.supabase.from("cqh_audit_log").insert({
      event_id: data.event_id,
      action: "shopping_list_rebuilt",
      actor_id: context.userId,
    });
    // Create a new revision via generateShoppingList path (caller invokes that next).
    return { ok: true };
  });

// ---------- Draft quote creation ----------

export const createDraftQuoteFromCqh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    event_id: string;
    shopping_list_id: string;
    guest_count: number;
    waste_pct: number;     // 0..1
    overhead_pct: number;  // 0..1
    target_margin_pct: number; // 0..1
    client_name?: string | null;
    client_email?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: ev } = await supabase.from("cqh_events").select("*").eq("id", data.event_id).single();
    const { data: items } = await supabase.from("cqh_shopping_list_items").select("*").eq("shopping_list_id", data.shopping_list_id);
    if (!ev || !items) throw new Error("Event or list not found");

    const rawCost = (items as any[]).reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_price ?? 0), 0);
    const adjustedCost = rawCost * (1 + (data.waste_pct ?? 0)) * (1 + (data.overhead_pct ?? 0));
    const guests = Math.max(1, data.guest_count || ev.guest_count || 1);
    const margin = Math.min(0.95, Math.max(0, data.target_margin_pct ?? 0.3));
    const total = margin >= 1 ? adjustedCost : adjustedCost / (1 - margin);
    const pricePerPerson = total / guests;

    // Mark older quotes for this event as superseded.
    const { data: prevQuotes } = await supabase
      .from("quotes").select("id").eq("cqh_event_id", data.event_id).is("superseded_by", null);

    const ref = `CQH-${Date.now().toString(36).toUpperCase()}`;
    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .insert({
        client_name: data.client_name ?? ev.name,
        client_email: data.client_email ?? null,
        event_date: ev.event_date,
        guest_count: guests,
        subtotal: total,
        total: total,
        theoretical_cost: adjustedCost,
        status: "draft",
        source: "competitor_quote_hub",
        cqh_event_id: data.event_id,
        cqh_shopping_list_id: data.shopping_list_id,
        reference_number: ref,
        notes: `Created from Competitor Quote Hub. Cost/person: $${(adjustedCost/guests).toFixed(2)}, Price/person: $${pricePerPerson.toFixed(2)}.`,
        user_id: context.userId,
      })
      .select("*").single();
    if (qErr) throw new Error(qErr.message);

    if (prevQuotes && prevQuotes.length) {
      await supabase.from("quotes").update({ superseded_by: quote.id }).in("id", prevQuotes.map((q: any) => q.id));
      for (const pq of prevQuotes) {
        await supabase.from("cqh_audit_log").insert({
          event_id: data.event_id, quote_id: pq.id, action: "quote_superseded",
          payload: { superseded_by: quote.id }, actor_id: context.userId,
        });
      }
    }

    await supabase.from("cqh_events").update({ status: "draft_quote" }).eq("id", data.event_id);
    await supabase.from("cqh_audit_log").insert({
      event_id: data.event_id, shopping_list_id: data.shopping_list_id, quote_id: quote.id,
      action: "draft_quote_created",
      payload: { total, price_per_person: pricePerPerson, guests, waste_pct: data.waste_pct, overhead_pct: data.overhead_pct, target_margin_pct: margin },
      actor_id: context.userId,
    });

    return { quote };
  });

export const updateDraftQuotePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quote_id: string; guest_count?: number; total?: number; notes?: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: q } = await supabase.from("quotes").select("status,cqh_event_id").eq("id", data.quote_id).single();
    if (!q) throw new Error("Quote not found");
    if (q.status !== "draft") throw new Error("Only draft quotes can be edited from here.");
    const patch: Record<string, any> = {};
    if (data.guest_count !== undefined) patch.guest_count = data.guest_count;
    if (data.total !== undefined) { patch.total = data.total; patch.subtotal = data.total; }
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase.from("quotes").update(patch).eq("id", data.quote_id);
    if (error) throw new Error(error.message);
    await supabase.from("cqh_audit_log").insert({
      event_id: q.cqh_event_id, quote_id: data.quote_id,
      action: "quote_pricing_updated", payload: patch, actor_id: context.userId,
    });
    return { ok: true };
  });
