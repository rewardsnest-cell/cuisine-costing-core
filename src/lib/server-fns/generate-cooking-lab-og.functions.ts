/**
 * Auto-generate a 16:9 social/OG image for a Cooking Lab entry from its
 * title (and optional cover image, used as a style reference). Uploads the
 * result to the public `recipe-photos` bucket under `cooking-lab-og/<id>/...`
 * and writes the URL into `cooking_lab_entries.seo_og_image_url`.
 *
 * Used by the SEO panel when the editor leaves the OG image field blank.
 * Auth: requires a Supabase session (admin/marketing enforced by RLS on
 * cooking_lab_entries — the update would fail otherwise).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiPost } from "./_ai-gateway";

const BUCKET = "recipe-photos";
const MODEL = "google/gemini-3.1-flash-image-preview";

const Input = z.object({ entryId: z.string().uuid() });

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entry";
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("AI returned an unexpected image format");
  const contentType = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

function buildPrompt(title: string, description: string) {
  return (
    `Editorial 16:9 social share image for an article titled "${title}".` +
    ` ${description ? `Subject: ${description.slice(0, 240)}.` : ""}` +
    ` Beautiful overhead or hero-angle food photography styled on warm wood,` +
    ` linen, or ceramic with natural soft light, shallow depth of field, and` +
    ` rich saturated colors. Leave clean negative space on the left third for` +
    ` potential overlay text but DO NOT render any text yourself.` +
    ` ABSOLUTELY NO text, captions, logos, watermarks, badges, buttons, UI,` +
    ` borders, frames, or people. Photorealistic, magazine quality, 1200x630.`
  );
}

export const generateCookingLabOgImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from("cooking_lab_entries")
      .select("id,title,description,image_url")
      .eq("id", data.entryId)
      .single();
    if (fetchErr || !entry) throw new Error(fetchErr?.message || "Entry not found");
    if (!entry.title?.trim()) throw new Error("Add a title before generating an OG image.");

    // If the entry already has a cover image, pass it as a style reference so
    // the OG image stays visually consistent with the entry. Otherwise we
    // generate purely from the title/description.
    const userContent: any[] = [{ type: "text", text: buildPrompt(entry.title, entry.description || "") }];
    if (entry.image_url) {
      userContent.push({ type: "image_url", image_url: { url: entry.image_url } });
    }

    const resp = await aiPost({
      model: MODEL,
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    });
    const json = await resp.json();
    const url: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("AI did not return an image — try again.");

    const { bytes, contentType } = dataUrlToBytes(url);
    const path = `cooking-lab-og/${entry.id}/${slug(entry.title)}-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await supabaseAdmin
      .from("cooking_lab_entries")
      .update({ seo_og_image_url: publicUrl })
      .eq("id", entry.id);
    if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

    return { url: publicUrl };
  });
