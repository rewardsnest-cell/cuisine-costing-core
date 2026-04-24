import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ScrapedRecipe = {
  source_url: string;
  name: string;
  description?: string | null;
  category?: string | null;
  cuisine?: string | null;
  prep_time?: number | null;
  cook_time?: number | null;
  servings?: number | null;
  instructions?: string | null;
  image_url?: string | null;
  allergens?: string[];
  is_vegan?: boolean;
  is_vegetarian?: boolean;
  is_gluten_free?: boolean;
  ingredients: { name: string; quantity: number; unit: string }[];
};

function gwHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured (link the Firecrawl connector)");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": FIRECRAWL_API_KEY,
    "Content-Type": "application/json",
  };
}

async function firecrawlMap(url: string): Promise<string[]> {
  const res = await fetch(`${GATEWAY}/map`, {
    method: "POST",
    headers: gwHeaders(),
    body: JSON.stringify({ url, limit: 500, includeSubdomains: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firecrawl map failed [${res.status}]: ${JSON.stringify(data)}`);
  const links: string[] = data.links ?? data.data?.links ?? [];
  return links;
}

async function firecrawlScrape(url: string): Promise<{ markdown?: string; metadata?: any }> {
  const res = await fetch(`${GATEWAY}/scrape`, {
    method: "POST",
    headers: gwHeaders(),
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firecrawl scrape failed [${res.status}]: ${JSON.stringify(data)}`);
  return {
    markdown: data.markdown ?? data.data?.markdown,
    metadata: data.metadata ?? data.data?.metadata,
  };
}

async function extractRecipeWithAI(markdown: string, url: string, fallbackImage?: string): Promise<ScrapedRecipe | null> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const schema = {
    type: "object",
    properties: {
      is_recipe: { type: "boolean", description: "True only if this page contains an actual cooking recipe with ingredients" },
      name: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      cuisine: { type: "string" },
      prep_time: { type: "number", description: "minutes" },
      cook_time: { type: "number", description: "minutes" },
      servings: { type: "number" },
      instructions: { type: "string" },
      image_url: { type: "string" },
      allergens: { type: "array", items: { type: "string" } },
      is_vegan: { type: "boolean" },
      is_vegetarian: { type: "boolean" },
      is_gluten_free: { type: "boolean" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
          },
          required: ["name", "quantity", "unit"],
        },
      },
    },
    required: ["is_recipe", "name", "ingredients"],
  };

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Extract recipe data from web page markdown. Return is_recipe=false for non-recipe pages (about, contact, blog index, etc). Use empty string/0 for unknown fields. Quantity must be a number; if a range, use the average." },
        { role: "user", content: `URL: ${url}\n\nMARKDOWN:\n${markdown.slice(0, 12000)}` },
      ],
      tools: [{ type: "function", function: { name: "extract_recipe", parameters: schema } }],
      tool_choice: { type: "function", function: { name: "extract_recipe" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(`AI extract failed [${res.status}]: ${t}`);
    return null;
  }
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  let parsed: any;
  try { parsed = JSON.parse(args); } catch { return null; }
  if (!parsed.is_recipe || !parsed.name || !Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) return null;

  return {
    source_url: url,
    name: String(parsed.name).trim(),
    description: parsed.description || null,
    category: parsed.category || null,
    cuisine: parsed.cuisine || null,
    prep_time: parsed.prep_time || null,
    cook_time: parsed.cook_time || null,
    servings: parsed.servings || null,
    instructions: parsed.instructions || null,
    image_url: parsed.image_url || fallbackImage || null,
    allergens: Array.isArray(parsed.allergens) ? parsed.allergens : [],
    is_vegan: !!parsed.is_vegan,
    is_vegetarian: !!parsed.is_vegetarian,
    is_gluten_free: !!parsed.is_gluten_free,
    ingredients: parsed.ingredients
      .filter((i: any) => i && i.name)
      .map((i: any) => ({
        name: String(i.name).trim(),
        quantity: Number(i.quantity) || 0,
        unit: String(i.unit || "each").trim(),
      })),
  };
}

export const scanVpsfinestRecipes = createServerFn({ method: "POST" }).handler(async () => {
  const allLinks = await firecrawlMap("https://www.vpsfinest.com");
  // Heuristic filter for recipe-like URLs
  const recipeLinks = Array.from(new Set(
    allLinks.filter((u) => /recipe|recipes/i.test(u) && !/\/recipes\/?$/i.test(u))
  )).slice(0, 60);

  const results: ScrapedRecipe[] = [];
  const errors: { url: string; error: string }[] = [];

  // Sequential to avoid rate limits
  for (const url of recipeLinks) {
    try {
      const { markdown, metadata } = await firecrawlScrape(url);
      if (!markdown) continue;
      const recipe = await extractRecipeWithAI(markdown, url, metadata?.ogImage);
      if (recipe) results.push(recipe);
    } catch (e: any) {
      errors.push({ url, error: e?.message || String(e) });
    }
  }

  return { recipes: results, errors, totalLinks: allLinks.length, candidateLinks: recipeLinks.length };
});

export const importVpsfinestRecipes = createServerFn({ method: "POST" })
  .inputValidator((input: { recipes: ScrapedRecipe[] }) => {
    if (!input || !Array.isArray(input.recipes)) throw new Error("recipes array required");
    return input;
  })
  .handler(async ({ data }) => {
    const inserted: { id: string; name: string; autoLinked?: number; autoCreated?: number }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const r of data.recipes) {
      if (!r.name || !r.ingredients?.length) {
        skipped.push({ name: r.name || "(unnamed)", reason: "missing name or ingredients" });
        continue;
      }

      const { data: existing } = await supabaseAdmin
        .from("recipes")
        .select("id")
        .ilike("name", r.name)
        .maybeSingle();

      if (existing) {
        skipped.push({ name: r.name, reason: "duplicate name" });
        continue;
      }

      const { data: recipe, error: recipeErr } = await supabaseAdmin
        .from("recipes")
        .insert({
          name: r.name,
          description: r.description,
          category: r.category,
          cuisine: r.cuisine,
          prep_time: r.prep_time,
          cook_time: r.cook_time,
          servings: r.servings || 1,
          instructions: r.instructions,
          image_url: r.image_url,
          allergens: r.allergens?.length ? r.allergens : null,
          is_vegan: r.is_vegan,
          is_vegetarian: r.is_vegetarian,
          is_gluten_free: r.is_gluten_free,
          active: true,
          // Imported recipes always start as draft so the publish gate runs
          // after ingredients are inserted and resolved.
          status: "draft",
          created_source: "import",
        } as any)
        .select("id")
        .single();

      if (recipeErr || !recipe) {
        skipped.push({ name: r.name, reason: recipeErr?.message || "insert failed" });
        continue;
      }

      // Smart auto-link / auto-create per ingredient
      const ingRows: any[] = [];
      let autoCreated = 0;
      let autoLinked = 0;
      for (const i of r.ingredients) {
        const linked = await resolveOrCreateInventoryForIngredient(i.name, i.unit);
        if (linked.created) autoCreated++;
        else if (linked.inventoryItemId) autoLinked++;
        ingRows.push({
          recipe_id: recipe.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          inventory_item_id: linked.inventoryItemId,
          reference_id: linked.referenceId,
        });
      }
      const { error: ingErr } = await supabaseAdmin.from("recipe_ingredients").insert(ingRows);
      if (ingErr) {
        skipped.push({ name: r.name, reason: `recipe inserted but ingredients failed: ${ingErr.message}` });
        continue;
      }

      inserted.push({ id: recipe.id, name: r.name, autoLinked, autoCreated });
    }

    return { inserted, skipped };
  });

// ---- smart linking helpers ----

async function fetchLatestFredPriceForKeyword(name: string): Promise<{ price: number; unit: string } | null> {
  const FRED_API_KEY = process.env.FRED_API_KEY;
  if (!FRED_API_KEY) return null;
  const norm = name.toLowerCase();
  const { data: maps } = await supabaseAdmin
    .from("fred_series_map")
    .select("series_id, unit, unit_conversion, match_keywords, label")
    .eq("active", true);
  const hit = (maps || []).find((m: any) =>
    (m.match_keywords || []).some((k: string) => norm.includes(String(k).toLowerCase())),
  );
  if (!hit) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(hit.series_id)}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const obs = json?.observations?.[0];
    const val = obs?.value && obs.value !== "." ? Number(obs.value) : NaN;
    if (!isFinite(val) || val <= 0) return null;
    return { price: val * Number(hit.unit_conversion || 1), unit: hit.unit || "lb" };
  } catch {
    return null;
  }
}

async function resolveOrCreateInventoryForIngredient(
  rawName: string,
  rawUnit: string,
): Promise<{ inventoryItemId: string | null; referenceId: string | null; created: boolean }> {
  const name = (rawName || "").trim();
  if (!name) return { inventoryItemId: null, referenceId: null, created: false };

  // Use the existing fuzzy/synonym matcher RPC
  const { data: matches } = await supabaseAdmin.rpc("find_ingredient_matches", { _name: name, _limit: 1 });
  const top = (matches as any[] | null)?.[0];
  if (top && (top.source === "synonym" || (top.similarity ?? 0) >= 0.8)) {
    return {
      inventoryItemId: top.inventory_item_id ?? null,
      referenceId: top.reference_id ?? null,
      created: false,
    };
  }

  // No confident match — create inventory item (pending review) + link via reference (trigger does that)
  const fred = await fetchLatestFredPriceForKeyword(name);
  const unit = (rawUnit || "each").trim();
  const { data: inv, error: invErr } = await supabaseAdmin
    .from("inventory_items")
    .insert({
      name,
      unit: fred?.unit || unit,
      average_cost_per_unit: fred?.price ?? 0,
      last_receipt_cost: fred?.price ?? null,
      created_source: "import_auto",
      pending_review: true,
    })
    .select("id")
    .single();
  if (invErr || !inv) {
    return { inventoryItemId: null, referenceId: null, created: false };
  }
  if (fred) {
    await supabaseAdmin.from("price_history").insert({
      inventory_item_id: inv.id,
      source: "fred_auto_import",
      unit_price: fred.price,
      unit: fred.unit,
    });
  }
  // The trg_inventory_create_reference trigger has already created/linked an ingredient_reference row.
  const { data: ref } = await supabaseAdmin
    .from("ingredient_reference")
    .select("id")
    .eq("inventory_item_id", inv.id)
    .maybeSingle();
  return { inventoryItemId: inv.id, referenceId: ref?.id ?? null, created: true };
}
