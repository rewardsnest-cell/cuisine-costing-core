// Competitor Quote Hub — server functions
// Admin-only mutations and AI generation. All write paths go through the
// authenticated supabase client (RLS enforces admin-only access). AI uses
// the existing Lovable AI gateway helper.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPost, AiGatewayError } from "./_ai-gateway";

// ---------- helpers ----------

async function logAudit(
  sb: any,
  actorId: string | null,
  args: {
    event_id?: string | null;
    shopping_list_id?: string | null;
    quote_id?: string | null;
    action: string;
    payload?: any;
  },
) {
  try {
    await sb.from("cqh_audit_log").insert({
      event_id: args.event_id ?? null,
      shopping_list_id: args.shopping_list_id ?? null,
      quote_id: args.quote_id ?? null,
      action: args.action,
      payload: args.payload ?? {},
      actor_id: actorId,
    });
  } catch (e) {
    console.warn("cqh audit log failed:", e);
  }
}

// ---------- create event ----------

export const cqhCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      event_date: z.string().nullable().optional(),
      guest_count: z.number().int().min(0).max(100000).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: row, error } = await sb
      .from("cqh_events")
      .insert({
        name: data.name,
        event_date: data.event_date || null,
        guest_count: data.guest_count ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { event: row };
  });

// ---------- update event ----------

export const cqhUpdateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      event_date: z.string().nullable().optional(),
      guest_count: z.number().int().min(0).max(100000).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("cqh_events")
      .update(rest)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { event: row };
  });

// ---------- add document ----------

export const cqhAddDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      event_id: z.string().uuid(),
      filename: z.string().min(1).max(500),
      file_type: z.string().min(1).max(100),
      storage_path: z.string().nullable().optional(),
      extracted_text: z.string().max(2_000_000).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: row, error } = await sb
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
    await logAudit(sb, context.userId, {
      event_id: data.event_id,
      action: "documents_uploaded",
      payload: { filename: data.filename, file_type: data.file_type },
    });
    return { document: row };
  });

// ---------- remove document ----------

export const cqhRemoveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: doc } = await sb
      .from("cqh_documents")
      .select("event_id, filename, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await sb.from("cqh_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (doc?.storage_path) {
      try {
        await sb.storage.from("cqh-documents").remove([doc.storage_path]);
      } catch (e) {
        console.warn("storage remove failed:", e);
      }
    }
    if (doc) {
      await logAudit(sb, context.userId, {
        event_id: doc.event_id,
        action: "documents_uploaded",
        payload: { removed: doc.filename },
      });
    }
    return { ok: true };
  });

// ---------- AI: extract dishes from event documents ----------

const DISH_TOOL = {
  type: "function",
  function: {
    name: "list_dishes",
    description: "Extract distinct dish/menu item names from the source documents.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Dish name (Title Case)" },
              is_main: { type: "boolean", description: "Likely a main / entrée" },
              source_doc_filenames: { type: "array", items: { type: "string" } },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
      required: ["dishes"],
      additionalProperties: false,
    },
  },
};

export const cqhExtractDishes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ event_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: docs } = await sb
      .from("cqh_documents")
      .select("id, filename, extracted_text")
      .eq("event_id", data.event_id);
    if (!docs || docs.length === 0) {
      return { dishes: [], error: "No documents to analyze" };
    }
    const corpus = docs
      .map(
        (d: any) =>
          `=== DOCUMENT: ${d.filename} ===\n${(d.extracted_text || "").slice(
            0,
            20_000,
          )}`,
      )
      .join("\n\n");

    try {
      const resp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You extract distinct catering dish/menu item names from competitor proposals. Return canonical Title Case names. Do not invent dishes that aren't present.",
          },
          {
            role: "user",
            content: `Extract every distinct dish from these documents:\n\n${corpus}`,
          },
        ],
        tools: [DISH_TOOL],
        tool_choice: { type: "function", function: { name: "list_dishes" } },
      });
      const ai = await resp.json();
      const args = ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : { dishes: [] };
      const dishes: any[] = Array.isArray(parsed.dishes) ? parsed.dishes : [];

      // Map filenames back to doc ids
      const filenameToId = new Map(docs.map((d: any) => [d.filename, d.id]));

      // Replace existing extracted dishes for this event
      await sb.from("cqh_dishes").delete().eq("event_id", data.event_id);
      const rows = dishes
        .filter((d) => d?.name)
        .map((d) => ({
          event_id: data.event_id,
          name: String(d.name).trim(),
          is_main: !!d.is_main,
          source_documents: (d.source_doc_filenames || [])
            .map((f: string) => filenameToId.get(f))
            .filter(Boolean) as string[],
        }));
      if (rows.length > 0) {
        await sb.from("cqh_dishes").insert(rows);
      }
      return { dishes: rows, count: rows.length };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { dishes: [], error: e.message, status: e.status };
      }
      throw e;
    }
  });

// ---------- dish edits (rename / merge / split / mark main) ----------

export const cqhUpdateDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      is_main: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("cqh_dishes")
      .update(rest)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      event_id: row.event_id,
      action: "dishes_merged_or_renamed",
      payload: { id, change: rest },
    });
    return { dish: row };
  });

export const cqhMergeDishes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      keep_id: z.string().uuid(),
      merge_ids: z.array(z.string().uuid()).min(1).max(20),
      new_name: z.string().min(1).max(255).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: keep, error: kErr } = await sb
      .from("cqh_dishes")
      .select("*")
      .eq("id", data.keep_id)
      .single();
    if (kErr || !keep) throw new Error(kErr?.message || "Dish not found");
    const { data: others } = await sb
      .from("cqh_dishes")
      .select("id, source_documents")
      .in("id", data.merge_ids);
    const sources = new Set<string>(keep.source_documents || []);
    (others || []).forEach((o: any) =>
      (o.source_documents || []).forEach((s: string) => sources.add(s)),
    );
    const mergedFrom = [...(keep.merged_from || []), ...data.merge_ids];
    await sb
      .from("cqh_dishes")
      .update({
        name: data.new_name || keep.name,
        source_documents: Array.from(sources),
        merged_from: mergedFrom,
      })
      .eq("id", data.keep_id);
    await sb.from("cqh_dishes").delete().in("id", data.merge_ids);
    await logAudit(sb, context.userId, {
      event_id: keep.event_id,
      action: "dishes_merged_or_renamed",
      payload: { keep_id: data.keep_id, merged: data.merge_ids, new_name: data.new_name },
    });
    return { ok: true };
  });

export const cqhDeleteDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: dish } = await sb
      .from("cqh_dishes")
      .select("event_id, name")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await sb.from("cqh_dishes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (dish) {
      await logAudit(sb, context.userId, {
        event_id: dish.event_id,
        action: "dishes_merged_or_renamed",
        payload: { deleted: dish.name },
      });
    }
    return { ok: true };
  });

export const cqhAddDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      event_id: z.string().uuid(),
      name: z.string().min(1).max(255),
      is_main: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cqh_dishes")
      .insert({
        event_id: data.event_id,
        name: data.name,
        is_main: !!data.is_main,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { dish: row };
  });

// ---------- AI: generate shopping list ----------

const SHOPPING_TOOL = {
  type: "function",
  function: {
    name: "build_shopping_list",
    description:
      "Propose ingredients per dish, scaled to guest count, with estimated quantities, units, and unit prices in USD.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish_name: { type: "string" },
              ingredients: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string" },
                    estimated_unit_price: { type: "number" },
                    notes: { type: "string" },
                  },
                  required: ["name", "quantity", "unit", "estimated_unit_price"],
                  additionalProperties: false,
                },
              },
            },
            required: ["dish_name", "ingredients"],
            additionalProperties: false,
          },
        },
      },
      required: ["dishes"],
      additionalProperties: false,
    },
  },
};

export const cqhGenerateShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ event_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: ev, error: eErr } = await sb
      .from("cqh_events")
      .select("*")
      .eq("id", data.event_id)
      .single();
    if (eErr || !ev) throw new Error(eErr?.message || "Event not found");
    const { data: dishes } = await sb
      .from("cqh_dishes")
      .select("id, name, is_main")
      .eq("event_id", data.event_id);
    if (!dishes || dishes.length === 0) {
      return { error: "Add or extract dishes first" };
    }

    const guests = ev.guest_count || 1;
    let proposal: any = { dishes: [] };
    try {
      const resp = await aiPost({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a catering chef. Generate realistic ingredient lists for each dish, scaled to the given guest count. Use simple, common ingredient names (lowercase, singular). Estimated unit prices in USD. Be specific about units (lb, oz, each, cup, gal, etc).",
          },
          {
            role: "user",
            content: `Event: ${ev.name}\nGuest count: ${guests}\n\nDishes:\n${dishes
              .map((d: any) => `- ${d.name}${d.is_main ? " (main)" : ""}`)
              .join("\n")}\n\nReturn ingredients per dish via the build_shopping_list tool.`,
          },
        ],
        tools: [SHOPPING_TOOL],
        tool_choice: { type: "function", function: { name: "build_shopping_list" } },
      });
      const ai = await resp.json();
      const args = ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      proposal = args ? JSON.parse(args) : { dishes: [] };
    } catch (e) {
      if (e instanceof AiGatewayError) return { error: e.message, status: e.status };
      throw e;
    }

    // Determine next revision number
    const { data: existing } = await sb
      .from("cqh_shopping_lists")
      .select("revision_number")
      .eq("event_id", data.event_id)
      .order("revision_number", { ascending: false })
      .limit(1);
    const nextRev = (existing?.[0]?.revision_number ?? 0) + 1;

    // Mark previous shopping lists as superseded
    await sb
      .from("cqh_shopping_lists")
      .update({ status: "superseded" })
      .eq("event_id", data.event_id)
      .neq("status", "superseded");

    const { data: sl, error: slErr } = await sb
      .from("cqh_shopping_lists")
      .insert({
        event_id: data.event_id,
        revision_number: nextRev,
        status: "draft",
        generated_by_ai: true,
      })
      .select("*")
      .single();
    if (slErr || !sl) throw new Error(slErr?.message || "Failed to create shopping list");

    const dishMap = new Map<string, string>();
    dishes.forEach((d: any) =>
      dishMap.set(d.name.toLowerCase().trim(), d.id),
    );

    const items: any[] = [];
    for (const dish of proposal.dishes || []) {
      const dishId = dishMap.get(String(dish.dish_name || "").toLowerCase().trim()) || null;
      for (const ing of dish.ingredients || []) {
        items.push({
          shopping_list_id: sl.id,
          dish_id: dishId,
          ingredient_name: String(ing.name || "").trim(),
          quantity: Number(ing.quantity) || 0,
          unit: String(ing.unit || "each"),
          unit_price: Number(ing.estimated_unit_price) || 0,
          notes: ing.notes || null,
          per_dish_allocation: dishId
            ? { [dishId]: Number(ing.quantity) || 0 }
            : {},
        });
      }
    }
    if (items.length > 0) {
      await sb.from("cqh_shopping_list_items").insert(items);
    }

    await sb
      .from("cqh_events")
      .update({ status: "shopping_list" })
      .eq("id", data.event_id);

    await logAudit(sb, context.userId, {
      event_id: data.event_id,
      shopping_list_id: sl.id,
      action: "shopping_list_generated_by_ai",
      payload: { revision: nextRev, item_count: items.length },
    });

    return { shopping_list: sl, item_count: items.length };
  });

// ---------- shopping list item edits ----------

export const cqhUpsertShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      shopping_list_id: z.string().uuid(),
      dish_id: z.string().uuid().nullable().optional(),
      ingredient_name: z.string().min(1).max(255),
      quantity: z.number().min(0),
      unit: z.string().max(50).nullable().optional(),
      unit_price: z.number().min(0),
      notes: z.string().max(2000).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Block structural edits if approved
    const { data: sl } = await sb
      .from("cqh_shopping_lists")
      .select("status, event_id")
      .eq("id", data.shopping_list_id)
      .single();
    if (sl?.status === "approved" && !data.id) {
      throw new Error("Cannot add items to an approved shopping list. Rebuild instead.");
    }
    if (data.id) {
      const { data: row, error } = await sb
        .from("cqh_shopping_list_items")
        .update({
          dish_id: data.dish_id ?? null,
          ingredient_name: data.ingredient_name,
          quantity: data.quantity,
          unit: data.unit ?? null,
          unit_price: data.unit_price,
          notes: data.notes ?? null,
        })
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { item: row };
    }
    const { data: row, error } = await sb
      .from("cqh_shopping_list_items")
      .insert({
        shopping_list_id: data.shopping_list_id,
        dish_id: data.dish_id ?? null,
        ingredient_name: data.ingredient_name,
        quantity: data.quantity,
        unit: data.unit ?? null,
        unit_price: data.unit_price,
        notes: data.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { item: row };
  });

export const cqhDeleteShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: it } = await sb
      .from("cqh_shopping_list_items")
      .select("shopping_list_id, cqh_shopping_lists!inner(status)")
      .eq("id", data.id)
      .maybeSingle();
    if ((it as any)?.cqh_shopping_lists?.status === "approved") {
      throw new Error("Cannot delete items from an approved shopping list.");
    }
    const { error } = await sb
      .from("cqh_shopping_list_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- approve shopping list ----------

export const cqhApproveShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: sl, error } = await sb
      .from("cqh_shopping_lists")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await sb
      .from("cqh_events")
      .update({ status: "approved" })
      .eq("id", sl.event_id);
    await logAudit(sb, context.userId, {
      event_id: sl.event_id,
      shopping_list_id: sl.id,
      action: "shopping_list_approved",
      payload: { revision: sl.revision_number },
    });
    return { shopping_list: sl };
  });

// ---------- create draft quote from approved shopping list ----------

export const cqhCreateDraftQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      shopping_list_id: z.string().uuid(),
      waste_pct: z.number().min(0).max(100).default(5),
      overhead_pct: z.number().min(0).max(100).default(15),
      target_margin_pct: z.number().min(0).max(95).default(35),
      target_price_per_person: z.number().min(0).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: sl, error: slErr } = await sb
      .from("cqh_shopping_lists")
      .select("*, cqh_events(*)")
      .eq("id", data.shopping_list_id)
      .single();
    if (slErr || !sl) throw new Error(slErr?.message || "Shopping list not found");
    if (sl.status !== "approved")
      throw new Error("Shopping list must be approved before creating a quote");

    const ev = sl.cqh_events;
    const { data: items } = await sb
      .from("cqh_shopping_list_items")
      .select("*")
      .eq("shopping_list_id", sl.id);

    const totalCost = (items || []).reduce(
      (s: number, it: any) => s + Number(it.quantity) * Number(it.unit_price),
      0,
    );
    const guests = Math.max(1, Number(ev.guest_count) || 1);
    const wasteMult = 1 + data.waste_pct / 100;
    const overheadMult = 1 + data.overhead_pct / 100;
    const adjustedCost = totalCost * wasteMult * overheadMult;
    const costPerPerson = adjustedCost / guests;
    const pricePerPerson =
      data.target_price_per_person ??
      costPerPerson / (1 - data.target_margin_pct / 100);
    const subtotal = pricePerPerson * guests;
    const taxRate = 0.08;
    const total = subtotal * (1 + taxRate);

    const { data: q, error: qErr } = await sb
      .from("quotes")
      .insert({
        client_name: null,
        event_type: ev.name,
        event_date: ev.event_date,
        guest_count: guests,
        subtotal,
        tax_rate: taxRate,
        total,
        theoretical_cost: adjustedCost,
        status: "draft",
        notes: `Draft quote from Competitor Quote Hub event "${ev.name}" (rev ${sl.revision_number})`,
        source: "competitor_quote_hub",
        cqh_event_id: ev.id,
        cqh_shopping_list_id: sl.id,
        user_id: null,
      })
      .select("*")
      .single();
    if (qErr || !q) throw new Error(qErr?.message || "Failed to create quote");

    // Create one quote_item per dish for visibility
    const { data: dishes } = await sb
      .from("cqh_dishes")
      .select("id, name")
      .eq("event_id", ev.id);
    if (dishes && dishes.length > 0) {
      const perDish = subtotal / dishes.length;
      const rows = dishes.map((d: any) => ({
        quote_id: q.id,
        recipe_id: null,
        name: d.name,
        quantity: guests,
        unit_price: perDish / guests,
        total_price: perDish,
      }));
      await sb.from("quote_items").insert(rows);
    }

    await sb
      .from("cqh_events")
      .update({ status: "draft_quote" })
      .eq("id", ev.id);

    await logAudit(sb, context.userId, {
      event_id: ev.id,
      shopping_list_id: sl.id,
      quote_id: q.id,
      action: "draft_quote_created",
      payload: {
        revision: sl.revision_number,
        cost_per_person: costPerPerson,
        price_per_person: pricePerPerson,
        total_cost: adjustedCost,
        total_price: total,
      },
    });

    return {
      quote: q,
      pricing: {
        total_cost: adjustedCost,
        cost_per_person: costPerPerson,
        price_per_person: pricePerPerson,
        subtotal,
        total,
      },
    };
  });

// ---------- update draft quote pricing (no revision) ----------

export const cqhUpdateQuotePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      quote_id: z.string().uuid(),
      price_per_person: z.number().min(0).optional(),
      guest_count: z.number().int().min(1).max(100000).optional(),
      discount: z.number().min(0).optional(),
      fees: z.number().min(0).optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: q, error } = await sb
      .from("quotes")
      .select("*")
      .eq("id", data.quote_id)
      .single();
    if (error || !q) throw new Error(error?.message || "Quote not found");
    if (q.status !== "draft")
      throw new Error("Only draft quotes can be re-priced without a new revision.");

    const guests = data.guest_count ?? q.guest_count;
    const ppp =
      data.price_per_person ??
      (Number(q.subtotal) || 0) / Math.max(1, Number(q.guest_count) || 1);
    const subtotal = ppp * guests + (data.fees || 0) - (data.discount || 0);
    const total = subtotal * (1 + Number(q.tax_rate || 0.08));

    const { data: updated, error: uErr } = await sb
      .from("quotes")
      .update({ guest_count: guests, subtotal, total })
      .eq("id", q.id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);

    await logAudit(sb, context.userId, {
      event_id: q.cqh_event_id,
      quote_id: q.id,
      action: "quote_pricing_updated",
      payload: {
        price_per_person: ppp,
        guest_count: guests,
        discount: data.discount,
        fees: data.fees,
      },
    });
    return { quote: updated };
  });

// ---------- rebuild shopping list (revision) ----------

export const cqhRebuildShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ event_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Mark any active draft quote tied to old list as superseded
    const { data: oldQuotes } = await sb
      .from("quotes")
      .select("id")
      .eq("cqh_event_id", data.event_id)
      .eq("status", "draft");
    if (oldQuotes && oldQuotes.length > 0) {
      const ids = oldQuotes.map((q: any) => q.id);
      await sb.from("quotes").update({ status: "superseded" }).in("id", ids);
      for (const id of ids) {
        await logAudit(sb, context.userId, {
          event_id: data.event_id,
          quote_id: id,
          action: "quote_superseded",
        });
      }
    }
    await logAudit(sb, context.userId, {
      event_id: data.event_id,
      action: "shopping_list_rebuilt",
    });
    // Caller should follow up with cqhGenerateShoppingList to create a new revision
    return { ok: true };
  });
