import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "recipe-photos";
const MODEL = "google/gemini-3.1-flash-image-preview";

const PROMPT_TPL = (name: string, desc: string, category: string) =>
  `Editorial overhead food photography of ${name}. ${desc || `A beautifully plated ${category || "dish"}.`}` +
  ` Plated on a rustic walnut wood board or warm parchment-toned ceramic dish.` +
  ` Natural soft window light, golden hour warmth, shallow depth of field.` +
  ` Garnished thoughtfully with fresh herbs. Cozy farm-to-table styling,` +
  ` tones of walnut brown, warm amber, sage green and cream. Magazine quality,` +
  ` photorealistic, no text, no watermarks, no people, no utensils in frame.`;

const SOCIAL_PROMPT_TPL = (name: string, desc: string, category: string) =>
  `Scroll-stopping social media food photograph of ${name}. ${desc || `A vibrant, beautifully styled ${category || "dish"}.`}` +
  ` Slight 3/4 hero angle, dramatic natural light with soft shadows, rich saturated colors,` +
  ` shallow depth of field, steam or fresh garnish for life and texture.` +
  ` Styled on warm wood, linen, or ceramic with complementary props off to the side.` +
  ` Composition leaves clean negative space at the top for potential headlines but contains NO text itself.` +
  ` ABSOLUTELY NO text, NO captions, NO logos, NO watermarks, NO price tags, NO coupons, NO buttons,` +
  ` NO badges, NO call-to-action graphics, NO UI elements, NO borders, NO frames, NO people.` +
  ` Pure photographic image only. Square 1:1 framing, magazine-quality, photorealistic.`;

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "recipe";
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL");
  const contentType = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

async function generateOne(name: string, desc: string, category: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: PROMPT_TPL(name, desc, category) }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const url: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("No image returned");
  return dataUrlToBytes(url);
}

export const listRecipesForPhotoGen = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id,name,description,category,image_url")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return { recipes: data || [] };
});

export const generateRecipePhoto = createServerFn({ method: "POST" })
  .inputValidator((input: { recipeId: string }) => input)
  .handler(async ({ data }) => {
    const { data: rec, error } = await supabaseAdmin
      .from("recipes")
      .select("id,name,description,category")
      .eq("id", data.recipeId)
      .single();
    if (error || !rec) throw new Error(error?.message || "Recipe not found");

    const { bytes, contentType } = await generateOne(
      rec.name,
      (rec.description || "").slice(0, 280),
      rec.category || ""
    );

    const path = `${rec.id}/${slug(rec.name)}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updErr } = await supabaseAdmin
      .from("recipes")
      .update({ image_url: publicUrl })
      .eq("id", rec.id);
    if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

    return { id: rec.id, name: rec.name, url: publicUrl };
  });
