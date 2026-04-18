// Build a counter quote from a competitor analysis:
// 1. For each line item, fuzzy-match against recipes; AI-generate missing recipes (with ingredients costed against inventory)
// 2. Auto-link AI ingredients to inventory using trigram + Levenshtein fuzzy match
// 3. Create a draft quote + quote_items priced at cost_per_serving × qty × MARKUP (configurable in app_settings)
// 4. Link via competitor_quotes.counter_quote_id
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MARKUP = 3.0; // 33% food cost target — overridden by app_settings.markup_multiplier
const TAX_RATE = 0.08;
const FUZZY_MATCH_THRESHOLD = 0.72; // tightened to avoid bad matches like "salt"→"Unsalted Butter"

// ---------- Unit conversion (recipe unit → inventory unit) ----------
const WEIGHT_TO_LB: Record<string, number> = {
  lb: 1, lbs: 1, pound: 1, pounds: 1,
  oz: 1 / 16, ounce: 1 / 16, ounces: 1 / 16,
  g: 1 / 453.592, gram: 1 / 453.592, grams: 1 / 453.592,
  kg: 2.20462, kilogram: 2.20462, kilograms: 2.20462,
};
const VOLUME_TO_QT: Record<string, number> = {
  qt: 1, quart: 1, quarts: 1,
  gal: 4, gallon: 4, gallons: 4,
  pt: 0.5, pint: 0.5, pints: 0.5,
  cup: 0.25, cups: 0.25, c: 0.25,
  "fl oz": 1 / 32, floz: 1 / 32,
  tbsp: 1 / 64, tablespoon: 1 / 64, tablespoons: 1 / 64,
  tsp: 1 / 192, teaspoon: 1 / 192, teaspoons: 1 / 192,
  ml: 1 / 946.353, milliliter: 1 / 946.353,
  l: 1.05669, liter: 1.05669, liters: 1.05669, litre: 1.05669,
};
const VOLUME_TO_LITER: Record<string, number> = {
  l: 1, liter: 1, liters: 1, litre: 1,
  ml: 0.001, milliliter: 0.001,
  qt: 0.946353, quart: 0.946353,
  gal: 3.78541, gallon: 3.78541,
  pt: 0.473176, pint: 0.473176,
  cup: 0.236588, cups: 0.236588,
  "fl oz": 0.0295735, floz: 0.0295735,
  tbsp: 0.0147868, tablespoon: 0.0147868,
  tsp: 0.00492892, teaspoon: 0.00492892,
};
function normUnit(u: string): string {
  return (u || "").toLowerCase().trim().replace(/\.$/, "");
}
function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const f = normUnit(fromUnit), t = normUnit(toUnit);
  if (!f || !t) return null;
  if (f === t) return qty;
  if (f in WEIGHT_TO_LB && t in WEIGHT_TO_LB) return (qty * WEIGHT_TO_LB[f]) / WEIGHT_TO_LB[t];
  if (f in VOLUME_TO_QT && t in VOLUME_TO_QT) return (qty * VOLUME_TO_QT[f]) / VOLUME_TO_QT[t];
  if (f in VOLUME_TO_LITER && t in VOLUME_TO_LITER) return (qty * VOLUME_TO_LITER[f]) / VOLUME_TO_LITER[t];
  return null; // incompatible (e.g. tsp → jar, oz → bunch)
}
// --------------------------------------

const RECIPE_TOOL = {
  type: "function",
  function: {
    name: "build_recipe",
    description: "Generate a realistic catering recipe scaled to one serving with itemized ingredients.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "e.g. Appetizer, Main, Side, Dessert, Beverage, Addon" },
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
              name: { type: "string", description: "Common ingredient name (e.g. 'chicken breast', 'olive oil')" },
              quantity: { type: "number", description: "Amount per ONE serving" },
              unit: { type: "string", description: "lb, oz, g, kg, cup, tbsp, tsp, each, ml, l" },
              estimated_cost_per_unit: { type: "number", description: "USD per single unit, used as fallback when inventory has no match" },
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

// ---------- Synonym map (AI ingredient name → canonical inventory name) ----------
// Loaded from the public.ingredient_synonyms table at request time so admins can edit
// the alias map without redeploying this function.
let INGREDIENT_SYNONYMS: Record<string, string> = {};

async function loadSynonyms(supabase: any) {
  try {
    const { data, error } = await supabase
      .from("ingredient_synonyms")
      .select("alias_normalized, canonical");
    if (error) {
      console.warn("loadSynonyms error", error.message);
      INGREDIENT_SYNONYMS = {};
      return;
    }
    const map: Record<string, string> = {};
    for (const row of data || []) {
      if (row?.alias_normalized && row?.canonical) {
        map[String(row.alias_normalized)] = norm(String(row.canonical));
      }
    }
    INGREDIENT_SYNONYMS = map;
  } catch (e) {
    console.warn("loadSynonyms threw", e);
    INGREDIENT_SYNONYMS = {};
  }
}

function applySynonym(name: string): string {
  const n = norm(name);
  return INGREDIENT_SYNONYMS[n] ?? n;
}
// --------------------------------------------------------------------------------

// ---------- Fuzzy matching helpers ----------
function trigrams(s: string): Set<string> {
  const padded = `  ${norm(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function combinedSimilarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const tri = trigramSimilarity(na, nb);
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  return tri * 0.6 + lev * 0.4;
}

type InvItem = { id: string; name: string; unit: string; average_cost_per_unit: number };

function bestInventoryMatch(name: string, inventory: InvItem[]): { item: InvItem; score: number } | null {
  // Try synonym-based exact match first (much higher confidence than fuzzy).
  const canonical = applySynonym(name);
  if (canonical) {
    for (const inv of inventory) {
      if (norm(inv.name) === canonical) return { item: inv, score: 1 };
    }
  }
  let best: { item: InvItem; score: number } | null = null;
  for (const inv of inventory) {
    const score = Math.max(
      combinedSimilarity(name, inv.name),
      combinedSimilarity(canonical, inv.name),
    );
    if (!best || score > best.score) best = { item: inv, score };
  }
  return best && best.score >= FUZZY_MATCH_THRESHOLD ? best : null;
}
// --------------------------------------------

async function aiGenerateRecipe(
  itemName: string,
  context: { eventType?: string | null; cuisine?: string | null },
  apiKey: string,
): Promise<any | null> {
  const sys = `You are a catering chef. Given a menu item name, return a realistic recipe scaled per ONE serving with simple, common ingredient names (lowercase, singular). Estimated costs in USD.`;
  const user = `Menu item: "${itemName}"${context.eventType ? `\nEvent: ${context.eventType}` : ""}${context.cuisine ? `\nCuisine hint: ${context.cuisine}` : ""}\n\nReturn the recipe via the build_recipe tool.`;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      tools: [RECIPE_TOOL],
      tool_choice: { type: "function", function: { name: "build_recipe" } },
    }),
  });
  if (!resp.ok) {
    console.error(`AI recipe gen failed for "${itemName}":`, resp.status, await resp.text().catch(() => ""));
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return null;
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { competitorQuoteId, force } = await req.json();
    if (!competitorQuoteId) throw new Error("competitorQuoteId is required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // 0a. Load admin-editable ingredient synonyms map
    await loadSynonyms(sb);

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
      .single();
    if (cqErr || !cq) throw new Error(cqErr?.message || "Competitor quote not found");
    const previousCounterId: string | null = cq.counter_quote_id ?? null;

    const analysis = (cq.analysis ?? {}) as any;
    const lineItems: any[] = Array.isArray(analysis.lineItems) ? analysis.lineItems : [];
    const guests = Number(cq.guest_count ?? analysis.guestCount ?? 1) || 1;

    // 2. Load existing recipes + inventory for matching
    const [{ data: recipes }, { data: inventory }] = await Promise.all([
      sb.from("recipes").select("id,name,cost_per_serving").eq("active", true),
      sb.from("inventory_items").select("id,name,unit,average_cost_per_unit"),
    ]);
    const recipeMap = new Map<string, { id: string; name: string; cost_per_serving: number | null }>();
    (recipes ?? []).forEach((r: any) => recipeMap.set(norm(r.name), r));
    const inventoryList: InvItem[] = (inventory ?? []) as InvItem[];

    let matchedExisting = 0;
    let aiCreated = 0;
    let aiFailed = 0;
    let ingredientsLinked = 0;
    let ingredientsUnlinked = 0;
    const itemsToInsert: any[] = [];

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
        const gen = await aiGenerateRecipe(
          itemName,
          { eventType: cq.event_type, cuisine: li.category },
          LOVABLE_API_KEY,
        );
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

        // Compute cost_per_serving from inventory matches (fuzzy); fall back to estimated cost
        let costPerServing = 0;
        const ingredientsRows: any[] = [];
        for (const ing of gen.ingredients) {
          const ingName = String(ing.name || "").trim();
          if (!ingName) continue;
          const ingQty = Number(ing.quantity ?? 0) || 0;
          const ingUnit = String(ing.unit ?? "each");
          const match = bestInventoryMatch(ingName, inventoryList);
          const invHit = match?.item ?? null;

          // Try to convert recipe qty into inventory's unit. If incompatible,
          // fall back to AI-estimated cost (using recipe unit) instead of inventing a price.
          let cpu: number;
          let qtyForCost: number;
          let linkedInvId: string | null = null;
          let noteSuffix = "";
          if (invHit && invHit.average_cost_per_unit > 0) {
            const converted = convertQty(ingQty, ingUnit, invHit.unit);
            if (converted !== null) {
              cpu = Number(invHit.average_cost_per_unit);
              qtyForCost = converted;
              linkedInvId = invHit.id;
              noteSuffix = ` (auto-linked, score ${match!.score.toFixed(2)}, ${ingQty}${ingUnit}→${converted.toFixed(4)}${invHit.unit})`;
              ingredientsLinked++;
            } else {
              cpu = Number(ing.estimated_cost_per_unit ?? 0) || 0;
              qtyForCost = ingQty;
              noteSuffix = ` (matched "${invHit.name}" but unit ${ingUnit}↔${invHit.unit} incompatible — using AI estimate)`;
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
        recipeMap.set(norm(itemName), recipe);
        aiCreated++;
      }

      const cps = Number(recipe.cost_per_serving ?? 0) || 0;
      const ourUnit = cps > 0 ? cps * MARKUP : competitorUnit;
      itemsToInsert.push({
        recipe_id: recipe.id,
        name: recipe.name,
        quantity: qty,
        unit_price: ourUnit,
        total_price: ourUnit * qty,
      });
    }

    // 4. Create the draft quote (or rebuild — replace previous if exists)
    const subtotal = itemsToInsert.reduce((s, it) => s + Number(it.total_price || 0), 0);
    const total = subtotal * (1 + TAX_RATE);

    let counterQuoteId: string;
    if (previousCounterId && force !== false) {
      // Rebuild: replace items + update totals on existing quote
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

    return new Response(JSON.stringify({
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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("build-counter-quote error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
