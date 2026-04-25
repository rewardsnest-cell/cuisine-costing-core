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
    const { error } = await context.supabase.from("cqh_events").update(patch).eq("id", data.id);
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
    const { error } = await context.supabase.from("cqh_dishes").update(patch).eq("id", data.id);
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

const DISHES_SYSTEM = `You extract a clean list of dish/menu item names from a competitor catering proposal or menu document.

Return ONLY valid JSON of this shape:
{ "dishes": [{ "name": string, "is_main": boolean }] }

Rules:
- Each "name" should be a concise dish name a chef would recognize (e.g. "Grilled Salmon", "Caesar Salad").
- Skip pricing, headers, dates, intros, and non-food items (linens, service, gratuity).
- Mark is_main=true ONLY for clear entrée/main items (proteins, signature mains). Sides/salads/apps/desserts are false.
- Deduplicate within the document.`;

export const extractDishesFromDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: docs, error } = await supabase
      .from("cqh_documents").select("id,filename,extracted_text").eq("event_id", data.event_id);
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) return { added: 0, dishes: [] };

    const allFound: { name: string; is_main: boolean; source_documents: string[] }[] = [];
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

    // Deduplicate by lowercased name across docs.
    const byKey = new Map<string, { name: string; is_main: boolean; source_documents: string[] }>();
    for (const d of allFound) {
      const k = d.name.toLowerCase();
      const existing = byKey.get(k);
      if (existing) {
        existing.is_main = existing.is_main || d.is_main;
        existing.source_documents = Array.from(new Set([...existing.source_documents, ...d.source_documents]));
      } else {
        byKey.set(k, { ...d });
      }
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

    // Aggregate items by (ingredient_name, unit).
    const aggregated = new Map<string, {
      ingredient_name: string;
      unit: string | null;
      quantity: number;
      per_dish_allocation: Record<string, number>;
      notes: string | null;
    }>();

    for (const dishOut of parsed.dishes ?? []) {
      const dishId = dishByName.get(String(dishOut.dish_name ?? "").toLowerCase()) ?? null;
      for (const ing of dishOut.ingredients ?? []) {
        const name = String(ing.ingredient_name ?? "").trim();
        if (!name) continue;
        const unit = ing.unit ? String(ing.unit) : null;
        const qty = Number(ing.quantity) || 0;
        const key = `${name.toLowerCase()}::${unit ?? ""}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity += qty;
          if (dishId) existing.per_dish_allocation[dishId] = (existing.per_dish_allocation[dishId] ?? 0) + qty;
        } else {
          aggregated.set(key, {
            ingredient_name: name,
            unit,
            quantity: qty,
            per_dish_allocation: dishId ? { [dishId]: qty } : {},
            notes: ing.notes ?? null,
          });
        }
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
