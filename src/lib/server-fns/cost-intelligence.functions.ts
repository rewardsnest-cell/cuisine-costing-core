import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const listIngredientCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("ingredient_reference")
      .select(
        "id,canonical_name,default_unit,kroger_unit_cost,kroger_unit_cost_updated_at,manual_unit_cost,manual_unit_cost_updated_at,historical_avg_unit_cost,historical_avg_updated_at,internal_estimated_unit_cost,internal_estimated_unit_cost_updated_at,internal_cost_weights",
      )
      .order("canonical_name", { ascending: true })
      .limit(data.limit ?? 200);
    if (data.search && data.search.trim()) {
      q = q.ilike("canonical_name", `%${data.search.trim()}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCostUpdateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("cost_update_queue")
      .select(
        "id,reference_id,source,current_cost,proposed_cost,percent_change,status,reviewed_by,reviewed_at,review_notes,final_applied_cost,created_at,ingredient_reference(canonical_name,default_unit)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    q = q.eq("status", data.status ?? "pending");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const proposeCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      reference_id: string;
      source: "kroger" | "manual" | "historical";
      kroger_cost?: number | null;
      manual_cost?: number | null;
      historical_cost?: number | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("propose_internal_cost_update", {
      _reference_id: data.reference_id,
      _source: data.source,
      _new_kroger: data.kroger_cost ?? null,
      _new_manual: data.manual_cost ?? null,
      _new_historical: data.historical_cost ?? null,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const approveCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_id: string; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("approve_cost_update", {
      _queue_id: data.queue_id,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const rejectCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_id: string; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("reject_cost_update", {
      _queue_id: data.queue_id,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

export const overrideCostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queue_id: string; manual_cost: number; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc("override_cost_update", {
      _queue_id: data.queue_id,
      _manual_cost: data.manual_cost,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });
