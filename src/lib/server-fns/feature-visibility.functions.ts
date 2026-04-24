import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const VISIBILITY_PHASES = ["off", "admin_preview", "soft_launch", "public"] as const;
export type VisibilityPhase = (typeof VISIBILITY_PHASES)[number];

export type FeatureVisibilityRow = {
  feature_key: string;
  phase: VisibilityPhase;
  nav_enabled: boolean;
  seo_indexing_enabled: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

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

/** Public read — anyone can call this; RLS allows anon SELECT. */
export const listFeatureVisibility = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeatureVisibilityRow[]> => {
    const { data, error } = await supabaseAdmin
      .from("feature_visibility" as any)
      .select("feature_key, phase, nav_enabled, seo_indexing_enabled, notes, updated_by, updated_at")
      .order("feature_key");
    if (error) throw new Error(error.message);
    return (data ?? []) as FeatureVisibilityRow[];
  },
);

const updateSchema = z.object({
  feature_key: z.string().min(1).max(64),
  phase: z.enum(VISIBILITY_PHASES).optional(),
  nav_enabled: z.boolean().optional(),
  seo_indexing_enabled: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateFeatureVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const patch: Record<string, any> = {};
    if (data.phase !== undefined) patch.phase = data.phase;
    if (data.nav_enabled !== undefined) patch.nav_enabled = data.nav_enabled;
    if (data.seo_indexing_enabled !== undefined) patch.seo_indexing_enabled = data.seo_indexing_enabled;
    if (data.notes !== undefined) patch.notes = data.notes;
    patch.updated_by = context.userId;

    if (Object.keys(patch).length === 1) {
      // only updated_by — nothing to change
      return { ok: true, changed: false };
    }

    const { error } = await supabaseAdmin
      .from("feature_visibility" as any)
      .update(patch)
      .eq("feature_key", data.feature_key);
    if (error) throw new Error(error.message);

    return { ok: true, changed: true };
  });
