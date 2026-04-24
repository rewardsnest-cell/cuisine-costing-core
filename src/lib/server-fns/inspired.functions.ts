import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const INSPIRED_PHASES = ["off", "admin_preview", "soft_launch", "public"] as const;
export type InspiredPhase = (typeof INSPIRED_PHASES)[number];

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

const setRecipeInspiredPhaseSchema = z.object({
  recipeId: z.string().uuid(),
  phase: z.enum(INSPIRED_PHASES),
});

/**
 * Update a single recipe's inspired_phase. The DB trigger
 * `log_inspired_recipe_change` writes audit + change-log draft entries
 * automatically, so this server fn only enforces admin auth + the column
 * write. If `phase` becomes anything other than 'off', the recipe must also
 * be marked as inspired.
 */
export const setRecipeInspiredPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setRecipeInspiredPhaseSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const update: Record<string, any> = { inspired_phase: data.phase };
    if (data.phase !== "off") update.inspired = true;
    const { error } = await (supabaseAdmin as any)
      .from("recipes")
      .update(update)
      .eq("id", data.recipeId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

const bulkSetSchema = z.object({
  recipeIds: z.array(z.string().uuid()).min(1).max(500),
  phase: z.enum(INSPIRED_PHASES),
});

export const bulkSetInspiredPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkSetSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const update: Record<string, any> = { inspired_phase: data.phase };
    if (data.phase !== "off") update.inspired = true;
    const { error, count } = await (supabaseAdmin as any)
      .from("recipes")
      .update(update, { count: "exact" })
      .in("id", data.recipeIds);
    if (error) throw new Error(error.message);
    return { success: true, updated: count ?? 0 };
  });

export const setInspiredNavEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const value = data.enabled ? "true" : "false";
    const { error } = await supabaseAdmin
      .from("app_kv")
      .upsert(
        { key: "inspired.nav_enabled", value, updated_by: context.userId },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { success: true };
  });
