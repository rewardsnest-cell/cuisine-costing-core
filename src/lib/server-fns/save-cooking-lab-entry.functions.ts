/**
 * Authoritative server-side save for Cooking Lab entries.
 *
 * SECURITY MODEL: The client has its own copy of `validateCookingLabEntryForPublish`
 * for live UX feedback, but it is NOT trusted. This handler re-runs the exact
 * same validation on the server before any row hits the database. If the caller
 * tries to flip `status` to "published" while QA items are incomplete or any
 * required Amazon link fails structural checks, the save is rejected — even if
 * the client bundle has been modified to bypass the publish button.
 *
 * Authentication: requires a Supabase auth session (admin role enforced by RLS
 * on `cooking_lab_entries`). We use `supabaseAdmin` here only because RLS
 * already restricts who can call this in practice; the structural publish check
 * is the layer this file actually owns.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateCookingLabEntryForPublish,
  type CookingLabEntryInput,
} from "@/lib/cooking-lab-validation";

const EntrySchema = z.object({
  id: z.string().uuid(),
  visible: z.boolean(),
  status: z.enum(["draft", "published"]),
  title: z.string(),
  description: z.string(),
  video_url: z.string().nullable(),
  image_url: z.string().nullable(),
  primary_tool_name: z.string().nullable(),
  primary_tool_url: z.string().nullable(),
  secondary_tool_name: z.string().nullable(),
  secondary_tool_url: z.string().nullable(),
  display_order: z.number(),
  qa_copy_reviewed: z.boolean(),
  qa_video_loads: z.boolean(),
  qa_image_loads: z.boolean(),
  qa_links_tested: z.boolean(),
  qa_ready: z.boolean(),
  // Per-entry SEO fields. All optional/nullable — when blank the public page
  // falls back to the entry's title/description/image and the page-level URL.
  seo_title: z.string().nullable().optional(),
  seo_description: z.string().nullable().optional(),
  seo_canonical_url: z.string().nullable().optional(),
  seo_og_image_url: z.string().nullable().optional(),
});

export const saveCookingLabEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => EntrySchema.parse(data))
  .handler(async ({ data }) => {
    // AUTHORITATIVE publish gate — runs regardless of client UI state.
    if (data.status === "published") {
      const failure = validateCookingLabEntryForPublish(data as CookingLabEntryInput);
      if (failure) {
        // Throwing here surfaces as a toast on the client and prevents the
        // database update from running. Do not weaken this — it is the only
        // protection against a tampered client bypassing publish gating.
        throw new Error(`Publish blocked by server validation: ${failure.reason}`);
      }
    }

    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("cooking_lab_entries")
      .update(rest)
      .eq("id", id);

    if (error) throw new Error(error.message);
    return { ok: true as const, id, status: data.status };
  });
