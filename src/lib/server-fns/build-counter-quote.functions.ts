// Build a counter quote from a competitor analysis:
// 1. For each line item, fuzzy-match against recipes; AI-generate missing recipes
// 2. Auto-link AI ingredients to inventory using the find_ingredient_matches RPC
//    (synonyms → ingredient_reference → trigram similarity over inventory)
// 3. Create a draft quote + quote_items priced at cost_per_serving × qty × MARKUP
// 4. Link via competitor_quotes.counter_quote_id
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aiPost, AiGatewayError } from "./_ai-gateway";

const DEFAULT_MARKUP = 3.0;
const TAX_RATE = 0.08;
const RPC_MATCH_THRESHOLD = 0.4; // similarity floor when accepting an inventory match from the RPC

// ---------- Unit conversion (recipe unit → inventory unit) ----------
const WEIGHT_TO_LB: Record<string, number> = {
  lb: 1, lbs: 1, pound: 1, pounds: 1,
  oz: 1 / 16, ounce: 1 / 16, ounces: 1 / 16,
  g: 1 / 453.592, gram: 1 / 453.592, grams: 1 / 453.592,
  kg: 2.20462, kilogram: 2.20462, kilograms: 2.20462,
};
const VOLUME_TO_LITER: Record<string, number> = {
  l: 1, liter: 1, liters: 1, litre: 1,
  ml: 0.001, milliliter: 0.001,
  qt: 0.946353, quart: 0.946353, quarts: 0.946353,
  gal: 3.78541, gallon: 3.78541, gallons: 3.78541,
  pt: 0.473176, pint: 0.473176, pints: 0.473176,
  cup: 0.236588, cups: 0.236588, c: 0.236588,
  "fl oz": 0.0295735, floz: 0.0295735,
  tbsp: 0.0147868, tablespoon: 0.0147868, tablespoons: 0.0147868,
  tsp: 0.00492892, teaspoon: 0.00492892, teaspoons: 0.00492892,
};
const COUNT_UNITS = new Set([
  "each", "ea", "piece", "pieces", "pc", "pcs", "unit", "units", "whole",
  "clove", "cloves", "slice", "slices", "bunch", "bunches", "sprig", "sprigs",
  "head", "heads", "stick", "sticks", "leaf", "leaves", "ear", "ears",
  "stalk", "stalks", "sheet", "sheets", "pkg", "package", "packages",
  "can", "cans", "jar", "jars", "bottle", "bottles", "box", "boxes", "bag", "bags",
]);
function normUnit(u: string): string {
  return (u || "").toLowerCase().trim().replace(/\.$/, "");
}
function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const f = normUnit(fromUnit), t = normUnit(toUnit);
  if (!f || !t) return null;
  if (f === t) return qty;
  if (f in WEIGHT_TO_LB && t in WEIGHT_TO_LB) return (qty * WEIGHT_TO_LB[f]) / WEIGHT_TO_LB[t];
  if (f in VOLUME_TO_LITER && t in VOLUME_TO_LITER) return (qty * VOLUME_TO_LITER[f]) / VOLUME_TO_LITER[t];
  if (COUNT_UNITS.has(f) && COUNT_UNITS.has(t)) return qty;
  return null;
}

const RECIPE_TOOL = {
  type: "function",
  function: {
    name: "build_recipe",
    description: "Generate a realistic catering recipe scaled to one serving with itemized ingredients.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        cuisine: { type: "string" },
        description: { type: "string" },
        is_vegetarian: { type: "boolean" },
        is_vegan: { type: "boolean" },
        is_gluten_free: { type: "boolean" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              estimated_cost_per_unit: { type: "number" },
            },
            required: ["name", "quantity", "unit", "estimated_cost_per_unit"],
            additionalProperties: false,
          },
        },
      },
      required: ["category", "ingredients"],
      additionalProperties: false,
    },
  },
};

function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function aiGenerateRecipe(
  itemName: string,
  context: { eventType?: string | null; cuisine?: string | null },
): Promise<any | null> {
  const sys = `You are a catering chef. Given a menu item name, return a realistic recipe scaled per ONE serving with simple, common ingredient names (lowercase, singular). Estimated costs in USD.`;
  const user = `Menu item: "${itemName}"${context.eventType ? `\nEvent: ${context.eventType}` : ""}${context.cuisine ? `\nCuisine hint: ${context.cuisine}` : ""}\n\nReturn the recipe via the build_recipe tool.`;
  try {
    const resp = await aiPost({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      tools: [RECIPE_TOOL],
      tool_choice: { type: "function", function: { name: "build_recipe" } },
    });
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) return null;
    return JSON.parse(call.function.arguments);
  } catch (e) {
    console.error(`AI recipe gen failed for "${itemName}":`, e);
    return null;
  }
}

type LineItem = { name?: string; qty?: number; unitPrice?: number; category?: string };

export const buildCounterQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { competitorQuoteId: string; force?: boolean }) => {
    if (!input?.competitorQuoteId) throw new Error("competitorQuoteId is required");
    return input;
  })
  .handler(async ({ data }) => {
    const sb = supabaseAdmin;
    const competitorQuoteId = data.competitorQuoteId;
    const force = data.force;

    try {
      // 0. Load configurable markup
      const { data: settings } = await sb
        .from("app_settings")
        .select("markup_multiplier")
        .eq("id", 1)
        .maybeSingle();
      const MARKUP = Number(settings?.markup_multiplier ?? DEFAULT_MARKUP) || DEFAULT_MARKUP;

      // 1. Load competitor quote
      const { data: cq, error: cqErr } = await sb
        .from("competitor_quotes")
        .select("*")
        .eq("id", competitorQuoteId)
        .maybeSingle();
      if (cqErr || !cq) throw new Error(cqErr?.message || "Competitor quote not found");
      const previousCounterId: string | null = cq.counter_quote_id ?? null;

      const analysis = (cq.analysis ?? {}) as any;
      const lineItems: LineItem[] = Array.isArray(analysis.lineItems) ? analysis.lineItems : [];
      const guests = Number(cq.guest_count ?? analysis.guestCount ?? 1) || 1;

      // 2. Load existing recipes for matching by name
      const { data: recipes } = await sb
        .from("recipes")
        .select("id,name,cost_per_serving")
        .eq("active", true);
      const recipeMap = new Map<string, { id: string; name: string; cost_per_serving: number | null }>();
      (recipes ?? []).forEach((r) => recipeMap.set(norm(r.name), r));

      let matchedExisting = 0;
      let aiCreated = 0;
      let aiFailed = 0;
      let ingredientsLinked = 0;
      let ingredientsUnlinked = 0;
      const itemsToInsert: any[] = [];

      // Inventory cache for unit lookup once we know matched ids
      const inventoryCache = new Map<string, { id: string; name: string; unit: string; average_cost_per_unit: number }>();
      async function getInventory(id: string) {
        if (inventoryCache.has(id)) return inventoryCache.get(id)!;
        const { data: inv } = await sb
          .from("inventory_items")
          .select("id,name,unit,average_cost_per_unit")
          .eq("id", id)
          .maybeSingle();
        if (inv) inventoryCache.set(id, inv as any);
        return inv as any;
      }

      // 3. For each line item, find or create a recipe
      for (const li of lineItems) {
        if (!li?.name) continue;
        const itemName = String(li.name);
        const qty = Math.max(1, Math.round(Number(li.qty ?? guests) || guests));
        const competitorUnit = Number(li.unitPrice ?? 0) || 0;
        let recipe = recipeMap.get(norm(itemName));

        if (recipe) {
          matchedExisting++;
        } else {
          const gen = await aiGenerateRecipe(itemName, {
            eventType: cq.event_type,
            cuisine: li.category,
          });
          if (!gen || !Array.isArray(gen.ingredients) || gen.ingredients.length === 0) {
            aiFailed++;
            itemsToInsert.push({
              recipe_id: null,
              name: itemName,
              quantity: qty,
              unit_price: competitorUnit,
              total_price: competitorUnit * qty,
            });
            continue;
          }

          let costPerServing = 0;
          const ingredientsRows: any[] = [];
          for (const ing of gen.ingredients) {
            const ingName = String(ing.name || "").trim();
            if (!ingName) continue;
            const ingQty = Number(ing.quantity ?? 0) || 0;
            const ingUnit = String(ing.unit ?? "each");

            // Use the find_ingredient_matches RPC instead of in-process fuzzy match.
            // It already prefers synonym → reference → fuzzy inventory in a single call.
            let matchedInv: { id: string; name: string; unit: string; average_cost_per_unit: number } | null = null;
            let referenceId: string | null = null;
            let matchScore = 0;
            try {
              const { data: matches } = await sb.rpc("find_ingredient_matches", {
                _name: ingName,
                _limit: 1,
              });
              const top = matches?.[0];
              if (top && (top.similarity ?? 0) >= RPC_MATCH_THRESHOLD) {
                referenceId = top.reference_id ?? null;
                matchScore = top.similarity ?? 0;
                if (top.inventory_item_id) {
                  matchedInv = await getInventory(top.inventory_item_id);
                }
              }
            } catch (err) {
              console.warn(`find_ingredient_matches failed for "${ingName}":`, err);
            }

            let cpu: number;
            let qtyForCost: number;
            let linkedInvId: string | null = null;
            let noteSuffix = "";

            if (matchedInv && matchedInv.average_cost_per_unit > 0) {
              const converted = convertQty(ingQty, ingUnit, matchedInv.unit);
              if (converted !== null) {
                cpu = Number(matchedInv.average_cost_per_unit);
                qtyForCost = converted;
                linkedInvId = matchedInv.id;
                noteSuffix = ` (auto-linked, score ${matchScore.toFixed(2)}, ${ingQty}${ingUnit}→${converted.toFixed(4)}${matchedInv.unit})`;
                ingredientsLinked++;
              } else {
                cpu = Number(ing.estimated_cost_per_unit ?? 0) || 0;
                qtyForCost = ingQty;
                noteSuffix = ` (matched "${matchedInv.name}" but unit ${ingUnit}↔${matchedInv.unit} incompatible — using AI estimate)`;
                ingredientsUnlinked++;
              }
            } else {
              cpu = Number(ing.estimated_cost_per_unit ?? 0) || 0;
              qtyForCost = ingQty;
              ingredientsUnlinked++;
            }
            costPerServing += cpu * qtyForCost;
            ingredientsRows.push({
              name: ingName,
              quantity: ingQty,
              unit: ingUnit,
              cost_per_unit: cpu,
              inventory_item_id: linkedInvId,
              reference_id: referenceId,
              notes: noteSuffix.trim() || null,
            });
          }

          const totalCost = costPerServing;
          const { data: newRecipe, error: recErr } = await sb
            .from("recipes")
            .insert({
              name: itemName,
              description: gen.description ?? `Auto-generated from competitor quote analysis`,
              category: gen.category ?? null,
              cuisine: gen.cuisine ?? null,
              servings: 1,
              is_vegetarian: !!gen.is_vegetarian,
              is_vegan: !!gen.is_vegan,
              is_gluten_free: !!gen.is_gluten_free,
              cost_per_serving: costPerServing,
              total_cost: totalCost,
              active: true,
              source_competitor_quote_id: competitorQuoteId,
            })
            .select("id,name,cost_per_serving")
            .single();
          if (recErr || !newRecipe) {
            console.error("Failed to insert recipe:", recErr?.message);
            aiFailed++;
            itemsToInsert.push({
              recipe_id: null,
              name: itemName,
              quantity: qty,
              unit_price: competitorUnit,
              total_price: competitorUnit * qty,
            });
            continue;
          }
          if (ingredientsRows.length > 0) {
            await sb.from("recipe_ingredients").insert(
              ingredientsRows.map((r) => ({ ...r, recipe_id: newRecipe.id })),
            );
          }
          recipe = newRecipe as any;
          recipeMap.set(norm(itemName), recipe!);
          aiCreated++;
        }

        const cps = Number(recipe!.cost_per_serving ?? 0) || 0;
        const ourUnit = cps > 0 ? cps * MARKUP : competitorUnit;
        itemsToInsert.push({
          recipe_id: recipe!.id,
          name: recipe!.name,
          quantity: qty,
          unit_price: ourUnit,
          total_price: ourUnit * qty,
        });
      }

      // 4. Create or rebuild the draft quote
      const subtotal = itemsToInsert.reduce((s, it) => s + Number(it.total_price || 0), 0);
      const total = subtotal * (1 + TAX_RATE);

      let counterQuoteId: string;
      if (previousCounterId && force !== false) {
        await sb.from("quote_items").delete().eq("quote_id", previousCounterId);
        const { error: updErr } = await sb
          .from("quotes")
          .update({
            subtotal,
            total,
            guest_count: guests,
            notes: `Re-built counter quote from competitor analysis${cq.competitor_name ? ` (${cq.competitor_name})` : ""}. ${aiCreated > 0 ? `${aiCreated} new recipe${aiCreated === 1 ? "" : "s"} generated.` : ""}`,
          })
          .eq("id", previousCounterId);
        if (updErr) throw new Error(updErr.message);
        counterQuoteId = previousCounterId;
      } else {
        const { data: q, error: qErr } = await sb
          .from("quotes")
          .insert({
            client_name: cq.client_name ?? analysis.clientName ?? null,
            client_email: cq.client_email ?? null,
            user_id: cq.client_user_id ?? null,
            event_type: cq.event_type ?? analysis.eventType ?? null,
            event_date: cq.event_date ?? analysis.eventDate ?? null,
            guest_count: guests,
            subtotal,
            tax_rate: TAX_RATE,
            total,
            status: "draft",
            notes: `Auto-built counter quote from competitor analysis${cq.competitor_name ? ` (${cq.competitor_name})` : ""}. ${aiCreated > 0 ? `${aiCreated} new recipe${aiCreated === 1 ? "" : "s"} generated.` : ""}`,
            dietary_preferences: { serviceStyle: cq.service_style ?? null, addons: analysis.addons ?? [] },
          })
          .select("id")
          .single();
        if (qErr || !q) throw new Error(qErr?.message || "Failed to create quote");
        counterQuoteId = q.id;
        await sb.from("competitor_quotes").update({ counter_quote_id: counterQuoteId }).eq("id", competitorQuoteId);
      }

      if (itemsToInsert.length > 0) {
        const rows = itemsToInsert.map((it) => ({ ...it, quote_id: counterQuoteId }));
        const { error: itemsErr } = await sb.from("quote_items").insert(rows);
        if (itemsErr) console.warn("quote_items insert warning:", itemsErr.message);
      }

      return {
        counterQuoteId,
        rebuilt: !!previousCounterId,
        stats: {
          lineItems: lineItems.length,
          matchedExisting,
          aiCreated,
          aiFailed,
          ingredientsLinked,
          ingredientsUnlinked,
          markup: MARKUP,
          subtotal,
          total,
        },
      };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { error: e.message, status: e.status, counterQuoteId: null, rebuilt: false, stats: null };
      }
      throw e;
    }
  });
