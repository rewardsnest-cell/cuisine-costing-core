import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aiPost, AiGatewayError, getApiKey } from "./_ai-gateway";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Auth check failed");
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

const TONE_PRESETS = [
  "Friendly & Casual",
  "Confident & Bold",
  "Cozy & Comforting",
  "Straightforward & Practical",
  "Viral / Feed-Optimized",
] as const;

const CATEGORIES = ["Easy Meal", "Copycat Recipe", "How-To"] as const;

const SYSTEM_PROMPT = `You are a professional home chef, recipe developer, and food content designer for Everyday Crumb.

YOUR ROLE:
- Develop recipes for everyday home cooks
- Optimize content for short-form video and feed-based platforms
- Use clear, simple, home-kitchen-friendly language

STRICT RULES:
- NO chef jargon (sauté → cook in oil, julienne → thin strips, etc.)
- NO trademarked recipe names or brand names in the title (e.g. "Big Mac", "Chick-fil-A Sandwich"). Use descriptive names instead ("Classic Stacked Cheeseburger", "Crispy Pickle-Brined Chicken Sandwich")
- NO unsafe cooking instructions (must include safe internal temps for meats, safe handling for eggs/seafood)
- One action per step with clear timing cues ("Cook 3-4 minutes until golden")
- Ingredients must be home-pantry friendly when possible
- Use US measurements (cups, tablespoons, ounces, pounds)`;

function tonePrompt(tone: string) {
  return `\n\nTONE: ${tone}. Apply this tone to title, notes, feed summary, and SEO description.`;
}

const RECIPE_TOOL = {
  type: "function" as const,
  function: {
    name: "create_recipe",
    description: "Return a complete recipe in the required structured format.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "Short, feed-friendly. No trademarks." },
        category: { type: "string", enum: CATEGORIES },
        description: { type: "string", description: "1-2 sentence appetizing description" },
        servings: { type: "number" },
        prep_time_minutes: { type: "number" },
        cook_time_minutes: { type: "number" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string", description: "e.g. cup, tbsp, tsp, oz, lb, clove, whole" },
            },
            required: ["name", "quantity", "unit"],
          },
        },
        steps: {
          type: "array",
          description: "Numbered. One action per step. Include timing cues.",
          items: { type: "string" },
        },
        notes: {
          type: "object",
          additionalProperties: false,
          properties: {
            substitutions: { type: "string" },
            storage: { type: "string" },
            reheating: { type: "string" },
          },
          required: ["substitutions", "storage", "reheating"],
        },
        seo_title: { type: "string", description: "SEO-optimized recipe title, ~60 chars" },
        seo_description: {
          type: "string",
          description: "150-160 character SEO meta description, search-optimized",
        },
        feed_summary: {
          type: "string",
          description: "Single scroll-stopping sentence for video feeds. No hashtags.",
        },
        suggested_tools: {
          type: "array",
          description: "Cooking tools (NOT ingredients) relevant to this recipe (skillet, blender, sous-vide, etc.)",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              reason: { type: "string" },
            },
            required: ["name", "reason"],
          },
        },
      },
      required: [
        "title",
        "category",
        "description",
        "servings",
        "prep_time_minutes",
        "cook_time_minutes",
        "ingredients",
        "steps",
        "notes",
        "seo_title",
        "seo_description",
        "feed_summary",
        "suggested_tools",
      ],
    },
  },
};

const generateInputSchema = z.object({
  promptText: z.string().max(4000).optional(),
  dishName: z.string().max(200).optional(),
  ingredientsList: z.string().max(2000).optional(),
  imageUrls: z.array(z.string().url()).max(6).optional(),
  videoUrl: z.string().url().max(500).optional(),
  copycatNotes: z.string().max(2000).optional(),
  tone: z.enum(TONE_PRESETS),
  category: z.enum(CATEGORIES).optional(),
});

function buildUserContent(input: z.infer<typeof generateInputSchema>) {
  const parts: any[] = [];
  const lines: string[] = [];

  if (input.dishName) lines.push(`Dish name: ${input.dishName}`);
  if (input.promptText) lines.push(`Prompt: ${input.promptText}`);
  if (input.ingredientsList) lines.push(`Available ingredients:\n${input.ingredientsList}`);
  if (input.copycatNotes) lines.push(`Copycat inspiration / flavor notes: ${input.copycatNotes}`);
  if (input.videoUrl) lines.push(`Video reference URL: ${input.videoUrl}`);
  if (input.category) lines.push(`Target category: ${input.category}`);

  if (lines.length === 0 && !input.imageUrls?.length) {
    lines.push("Create an easy weeknight dinner recipe.");
  }

  parts.push({ type: "text", text: lines.join("\n\n") });

  for (const url of input.imageUrls ?? []) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

async function callRecipeAi(input: z.infer<typeof generateInputSchema>) {
  const hasMultimodal = (input.imageUrls?.length ?? 0) > 0;
  const model = hasMultimodal ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT + tonePrompt(input.tone) },
      { role: "user", content: buildUserContent(input) },
    ],
    tools: [RECIPE_TOOL],
    tool_choice: { type: "function", function: { name: "create_recipe" } },
  };

  const resp = await aiPost(body);
  const json = await resp.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI did not return a structured recipe");
  const args = typeof call.function.arguments === "string"
    ? JSON.parse(call.function.arguments)
    : call.function.arguments;
  return { recipe: args, model };
}

// ---- Generate recipe (returns draft preview, NOT saved) ----
export const generateRecipeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    try {
      const { recipe, model } = await callRecipeAi(data);
      return {
        success: true as const,
        recipe,
        meta: { model, generated_at: new Date().toISOString(), tone: data.tone },
      };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { success: false as const, error: e.detail, status: e.status };
      }
      console.error("generateRecipeDraft error", e);
      return { success: false as const, error: e instanceof Error ? e.message : "Generation failed", status: 500 };
    }
  });

// ---- Bulk generate ----
const bulkSchema = generateInputSchema.extend({
  count: z.number().int().min(1).max(10),
  variationType: z.enum(["flavor", "protein", "method"]),
});

export const bulkGenerateRecipeDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const drafts: Array<{ recipe: any; meta: any } | { error: string }> = [];
    for (let i = 0; i < data.count; i++) {
      const variantHint = `Variation ${i + 1} of ${data.count}. Vary by ${data.variationType}. Make this clearly distinct from the others.`;
      const input = {
        ...data,
        promptText: `${data.promptText ?? ""}\n\n${variantHint}`.trim(),
      };
      try {
        const { recipe, model } = await callRecipeAi(input);
        drafts.push({
          recipe,
          meta: { model, generated_at: new Date().toISOString(), tone: data.tone, variant_index: i + 1 },
        });
      } catch (e) {
        drafts.push({ error: e instanceof Error ? e.message : "Generation failed" });
      }
    }
    return { success: true as const, drafts };
  });

// ---- Regenerate a specific section ----
const regenSchema = z.object({
  recipe: z.any(),
  section: z.enum(["title", "ingredients", "steps", "notes", "seo", "feed", "tools"]),
  tone: z.enum(TONE_PRESETS),
});

export const regenerateRecipeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => regenSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const sectionInstruction: Record<string, string> = {
      title: "Generate ONLY a new title (and seo_title) for this recipe. Keep all other fields identical.",
      ingredients: "Regenerate ONLY the ingredients list, keeping the same dish concept.",
      steps: "Regenerate ONLY the step-by-step instructions, keeping the same ingredients.",
      notes: "Regenerate ONLY the notes (substitutions, storage, reheating).",
      seo: "Regenerate ONLY the seo_title and seo_description.",
      feed: "Regenerate ONLY the feed_summary.",
      tools: "Regenerate ONLY the suggested_tools list.",
    };

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + tonePrompt(data.tone) },
        {
          role: "user",
          content: `Existing recipe (JSON):\n${JSON.stringify(data.recipe)}\n\n${sectionInstruction[data.section]} Return the COMPLETE recipe with only the requested section changed.`,
        },
      ],
      tools: [RECIPE_TOOL],
      tool_choice: { type: "function", function: { name: "create_recipe" } },
    };
    try {
      const resp = await aiPost(body);
      const json = await resp.json();
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) throw new Error("AI did not return structured output");
      const args = typeof call.function.arguments === "string"
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;
      return { success: true as const, recipe: args };
    } catch (e) {
      if (e instanceof AiGatewayError) {
        return { success: false as const, error: e.detail, status: e.status };
      }
      return { success: false as const, error: e instanceof Error ? e.message : "Regeneration failed", status: 500 };
    }
  });

// ---- Generate recipe image ----
const imageSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
});

export const generateAiRecipeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => imageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const apiKey = getApiKey();
    const prompt = `Photorealistic food photograph of "${data.title}". ${data.description ?? ""} ` +
      `Finished dish on a clean neutral background (light gray, off-white, or warm beige). ` +
      `Bright, even, appetizing studio lighting. Crisp focus on the food. ` +
      `Slight overhead-angle hero shot, magazine quality. ` +
      `ABSOLUTELY NO text, NO logos, NO watermarks, NO captions, NO people. Pure photographic image only.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Image generation failed: ${res.status} ${t}`);
    }
    const json = await res.json();
    const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    if (!dataUrl) throw new Error("No image returned");

    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Invalid image data URL");
    const contentType = m[1];
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "recipe";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `ai-create/${slug}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("recipe-photos")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: pub } = supabaseAdmin.storage.from("recipe-photos").getPublicUrl(path);
    return { success: true as const, image_url: pub.publicUrl };
  });

// ---- Save draft / Publish ----
const saveSchema = z.object({
  recipe: z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    category: z.string().max(100).optional().nullable(),
    description: z.string().optional().nullable(),
    servings: z.number().int().min(1).max(50),
    prep_time_minutes: z.number().int().min(0).max(1440).optional().nullable(),
    cook_time_minutes: z.number().int().min(0).max(1440).optional().nullable(),
    ingredients: z.array(z.object({
      name: z.string().min(1).max(200),
      quantity: z.number(),
      unit: z.string().max(40),
    })),
    steps: z.array(z.string().max(2000)),
    notes: z.object({
      substitutions: z.string().max(2000).optional().nullable(),
      storage: z.string().max(2000).optional().nullable(),
      reheating: z.string().max(2000).optional().nullable(),
    }),
    seo_title: z.string().max(200).optional().nullable(),
    seo_description: z.string().max(500).optional().nullable(),
    feed_summary: z.string().max(500).optional().nullable(),
    image_url: z.string().url().max(1000).optional().nullable(),
    suggested_tools: z.array(z.object({
      name: z.string().max(200),
      reason: z.string().max(500).optional().nullable(),
    })).optional(),
  }),
  inputs: z.any().optional(),
  meta: z.any().optional(),
  tone: z.enum(TONE_PRESETS),
  publish: z.boolean(),
});

export const saveAiRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const r = data.recipe;

    if (data.publish) {
      if (!r.title || !r.ingredients.length || !r.steps.length || !r.image_url) {
        throw new Error("Publishing requires title, ingredients, instructions, and image.");
      }
    }

    const instructionsText = r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");

    const recipePayload: any = {
      name: r.title,
      description: r.description ?? null,
      category: r.category ?? null,
      servings: r.servings,
      prep_time: r.prep_time_minutes ?? null,
      cook_time: r.cook_time_minutes ?? null,
      instructions: instructionsText,
      image_url: r.image_url ?? null,
      seo_title: r.seo_title ?? null,
      seo_description: r.seo_description ?? null,
      feed_summary: r.feed_summary ?? null,
      storage_instructions: r.notes.storage ?? null,
      reheating_instructions: r.notes.reheating ?? null,
      tone: data.tone,
      ai_generated: true,
      ai_inputs: data.inputs ?? null,
      ai_generation_meta: { ...(data.meta ?? {}), admin_user_id: context.userId, saved_at: new Date().toISOString() },
      status: data.publish ? "published" : "draft",
      active: true,
    };

    let recipeId = r.id;
    if (recipeId) {
      const { error } = await supabaseAdmin.from("recipes").update(recipePayload).eq("id", recipeId);
      if (error) throw new Error(`Update failed: ${error.message}`);
      await supabaseAdmin.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    } else {
      const { data: ins, error } = await supabaseAdmin.from("recipes").insert(recipePayload).select("id").single();
      if (error) throw new Error(`Insert failed: ${error.message}`);
      recipeId = ins.id;
    }

    const ingRows = r.ingredients.map((i) => ({
      recipe_id: recipeId!,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
    }));
    if (ingRows.length) {
      const { error } = await supabaseAdmin.from("recipe_ingredients").insert(ingRows);
      if (error) throw new Error(`Ingredient save failed: ${error.message}`);
    }

    if (r.suggested_tools?.length && !r.id) {
      await supabaseAdmin.from("recipe_tool_suggestions").insert(
        r.suggested_tools.map((t) => ({
          recipe_id: recipeId!,
          name: t.name,
          reason: t.reason ?? null,
          status: "suggested",
        })),
      );
    }

    return { success: true as const, recipe_id: recipeId, status: recipePayload.status };
  });

// ---- Tool suggestion update ----
const toolUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["added", "dismissed"]),
  affiliate_url: z.string().url().max(1000).optional().nullable(),
});

export const updateRecipeToolSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => toolUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("recipe_tool_suggestions")
      .update({
        status: data.status,
        affiliate_url: data.affiliate_url ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });
