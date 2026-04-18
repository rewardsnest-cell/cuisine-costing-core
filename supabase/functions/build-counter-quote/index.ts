// Build a counter quote from a competitor analysis:
// 1. For each line item, fuzzy-match against recipes; AI-generate missing recipes (with ingredients costed against inventory)
// 2. Create a draft quote + quote_items priced at cost_per_serving × qty × MARKUP
// 3. Link via competitor_quotes.counter_quote_id
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MARKUP = 3.0; // 33% food cost target
const TAX_RATE = 0.08;

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
    const { competitorQuoteId } = await req.json();
    if (!competitorQuoteId) throw new Error("competitorQuoteId is required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Load competitor quote
    const { data: cq, error: cqErr } = await sb
      .from("competitor_quotes")
      .select("*")
      .eq("id", competitorQuoteId)
      .single();
    if (cqErr || !cq) throw new Error(cqErr?.message || "Competitor quote not found");
    if (cq.counter_quote_id) {
      return new Response(JSON.stringify({ skipped: true, reason: "already has counter quote", counterQuoteId: cq.counter_quote_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const invMap = new Map<string, { id: string; unit: string; average_cost_per_unit: number }>();
    (inventory ?? []).forEach((i: any) => invMap.set(norm(i.name), i));

    let matchedExisting = 0;
    let aiCreated = 0;
    let aiFailed = 0;
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
        // AI-generate the recipe
        const gen = await aiGenerateRecipe(
          itemName,
          { eventType: cq.event_type, cuisine: li.category },
          LOVABLE_API_KEY,
        );
        if (!gen || !Array.isArray(gen.ingredients) || gen.ingredients.length === 0) {
          aiFailed++;
          // Fall back: insert quote item with competitor price
          itemsToInsert.push({
            recipe_id: null,
            name: itemName,
            quantity: qty,
            unit_price: competitorUnit,
            total_price: competitorUnit * qty,
          });
          continue;
        }

        // Compute cost_per_serving from inventory matches; fall back to estimated cost
        let costPerServing = 0;
        const ingredientsRows: any[] = [];
        for (const ing of gen.ingredients) {
          const ingName = String(ing.name || "").trim();
          if (!ingName) continue;
          const invHit = invMap.get(norm(ingName));
          const cpu = invHit && invHit.average_cost_per_unit > 0
            ? Number(invHit.average_cost_per_unit)
            : Number(ing.estimated_cost_per_unit ?? 0) || 0;
          const ingQty = Number(ing.quantity ?? 0) || 0;
          costPerServing += cpu * ingQty;
          ingredientsRows.push({
            name: ingName,
            quantity: ingQty,
            unit: String(ing.unit ?? "each"),
            cost_per_unit: cpu,
            inventory_item_id: invHit?.id ?? null,
          });
        }

        const totalCost = costPerServing; // per serving = total when servings=1
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

      // Price = cost_per_serving × qty × MARKUP (fallback to competitor price if zero cost)
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

    // 4. Create the draft quote
    const subtotal = itemsToInsert.reduce((s, it) => s + Number(it.total_price || 0), 0);
    const total = subtotal * (1 + TAX_RATE);
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

    if (itemsToInsert.length > 0) {
      const rows = itemsToInsert.map((it) => ({ ...it, quote_id: q.id }));
      const { error: itemsErr } = await sb.from("quote_items").insert(rows);
      if (itemsErr) console.warn("quote_items insert warning:", itemsErr.message);
    }

    await sb.from("competitor_quotes").update({ counter_quote_id: q.id }).eq("id", competitorQuoteId);

    return new Response(JSON.stringify({
      counterQuoteId: q.id,
      stats: {
        lineItems: lineItems.length,
        matchedExisting,
        aiCreated,
        aiFailed,
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
