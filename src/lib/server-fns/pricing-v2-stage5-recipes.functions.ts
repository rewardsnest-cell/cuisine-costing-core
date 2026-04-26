// Pricing v2 — Stage 5: Roll up recipe costs (grams-only).
// Reads inventory_items.cost_per_gram_live and recipe_ingredients.quantity_grams.
// Writes immutable snapshots to pricing_v2_recipe_costs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runStage5RecipeRollup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    recipe_ids: z.array(z.string().uuid()).optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: "rollups",
        status: "running",
        initiated_by: userId ?? null,
        notes: "Stage 5 — recipe cost rollup",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId = runRow.run_id as string;

    // Load recipes.
    let recipeQuery = supabase.from("recipes").select("id, name, servings").eq("active", true);
    if (data.recipe_ids?.length) recipeQuery = recipeQuery.in("id", data.recipe_ids);
    const { data: recipes, error: recErr } = await recipeQuery;
    if (recErr) throw new Error(recErr.message);

    const recipeIds = (recipes ?? []).map((r: any) => r.id);
    if (recipeIds.length === 0) {
      await supabase.from("pricing_v2_runs").update({
        status: "success", ended_at: new Date().toISOString(), counts_in: 0, counts_out: 0,
      }).eq("run_id", runId);
      return { run_id: runId, processed: 0, ok: 0, warning: 0, blocked: 0 };
    }

    // Load all ingredients in one query.
    const { data: ingredients } = await supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, name, quantity_grams, inventory_item_id, normalization_status")
      .in("recipe_id", recipeIds);

    // Load inventory cost map.
    const invIds = Array.from(new Set((ingredients ?? []).map((i: any) => i.inventory_item_id).filter(Boolean))) as string[];
    const invMap = new Map<string, { cost_per_gram_live: number | null; pricing_status: string; name: string }>();
    if (invIds.length) {
      const { data: inv } = await supabase
        .from("inventory_items")
        .select("id, name, cost_per_gram_live, pricing_status")
        .in("id", invIds);
      for (const r of inv ?? []) {
        invMap.set(r.id, {
          cost_per_gram_live: r.cost_per_gram_live != null ? Number(r.cost_per_gram_live) : null,
          pricing_status: r.pricing_status,
          name: r.name,
        });
      }
    }

    // Group ingredients by recipe.
    const ingByRecipe = new Map<string, any[]>();
    for (const ing of ingredients ?? []) {
      const arr = ingByRecipe.get(ing.recipe_id) ?? [];
      arr.push(ing);
      ingByRecipe.set(ing.recipe_id, arr);
    }

    // Mark previous current snapshots as not current.
    await supabase
      .from("pricing_v2_recipe_costs")
      .update({ is_current: false })
      .in("recipe_id", recipeIds)
      .eq("is_current", true);

    let okCount = 0, warningCount = 0, blockedCount = 0;
    const snapshots: any[] = [];

    for (const recipe of recipes ?? []) {
      const ings = ingByRecipe.get(recipe.id) ?? [];
      const breakdown: any[] = [];
      const blockers: string[] = [];
      const warns: string[] = [];
      let totalCost = 0;
      let blocked = false;

      if (ings.length === 0) {
        blockers.push("NO_INGREDIENTS");
        blocked = true;
      }

      for (const ing of ings) {
        const grams = ing.quantity_grams != null ? Number(ing.quantity_grams) : null;
        if (grams == null || !(grams > 0)) {
          blockers.push(`ZERO_OR_NEGATIVE_GRAMS:${ing.name}`);
          blocked = true;
          breakdown.push({
            name: ing.name,
            grams,
            cost_per_gram: null,
            ingredient_cost: null,
            source: "missing_grams",
            status: "BLOCKED",
          });
          continue;
        }
        if (!ing.inventory_item_id) {
          blockers.push(`MISSING_INGREDIENT_COST:${ing.name}`);
          blocked = true;
          breakdown.push({
            name: ing.name, grams, cost_per_gram: null, ingredient_cost: null,
            source: "unmapped", status: "BLOCKED",
          });
          continue;
        }
        const inv = invMap.get(ing.inventory_item_id);
        if (!inv || inv.pricing_status === "BLOCKED_MISSING_COST" || inv.cost_per_gram_live == null) {
          blockers.push(`MISSING_INGREDIENT_COST:${ing.name}`);
          blocked = true;
          breakdown.push({
            name: ing.name, grams, cost_per_gram: null, ingredient_cost: null,
            source: "blocked_inventory", status: "BLOCKED",
            inventory_item_id: ing.inventory_item_id, inventory_name: inv?.name,
          });
          continue;
        }
        const cpg = Number(inv.cost_per_gram_live);
        const ingCost = grams * cpg;
        totalCost += ingCost;
        if (inv.pricing_status === "DEGRADED_FALLBACK") warns.push(`DEGRADED_INGREDIENT:${ing.name}`);
        breakdown.push({
          name: ing.name,
          grams,
          cost_per_gram: cpg,
          ingredient_cost: ingCost,
          source: inv.pricing_status === "DEGRADED_FALLBACK" ? "fallback" : "live",
          status: inv.pricing_status === "DEGRADED_FALLBACK" ? "WARNING" : "OK",
          inventory_item_id: ing.inventory_item_id,
          inventory_name: inv.name,
        });
      }

      const servings = Math.max(Number(recipe.servings) || 1, 1);
      let status: "OK" | "WARNING" | "BLOCKED" = "OK";
      if (blocked) status = "BLOCKED";
      else if (warns.length) status = "WARNING";

      if (status === "BLOCKED") blockedCount++;
      else if (status === "WARNING") warningCount++;
      else okCount++;

      snapshots.push({
        recipe_id: recipe.id,
        run_id: runId,
        total_cost: blocked ? null : Math.round(totalCost * 10000) / 10000,
        cost_per_serving: blocked ? null : Math.round((totalCost / servings) * 10000) / 10000,
        servings,
        status,
        blocker_reasons: blockers,
        warning_flags: warns,
        ingredient_breakdown: breakdown,
        is_current: true,
      });
    }

    if (snapshots.length) {
      // Insert in batches of 100 to avoid payload limits.
      for (let i = 0; i < snapshots.length; i += 100) {
        const chunk = snapshots.slice(i, i + 100);
        const { error: insErr } = await supabase.from("pricing_v2_recipe_costs").insert(chunk);
        if (insErr) {
          await supabase.from("pricing_v2_errors").insert({
            run_id: runId, stage: "rollups", severity: "error",
            type: "INSERT_RECIPE_COSTS_FAILED", entity_type: "batch",
            message: insErr.message,
          });
        }
      }
    }

    await supabase.from("pricing_v2_runs").update({
      status: "success",
      ended_at: new Date().toISOString(),
      counts_in: recipes?.length ?? 0,
      counts_out: snapshots.length,
      warnings_count: warningCount,
      errors_count: blockedCount,
    }).eq("run_id", runId);

    return {
      run_id: runId,
      processed: snapshots.length,
      ok: okCount,
      warning: warningCount,
      blocked: blockedCount,
    };
  });

// ---- Listing & explain helpers --------------------------------------------

export const listRecipeCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    status: z.enum(["OK", "WARNING", "BLOCKED", "all"]).default("all"),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_recipe_costs")
      .select("id, recipe_id, total_cost, cost_per_serving, servings, status, blocker_reasons, warning_flags, created_at, recipes!inner(id, name, category)")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getRecipeCostExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ recipe_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: snap, error } = await supabase
      .from("pricing_v2_recipe_costs")
      .select("*, recipes!inner(id, name, servings)")
      .eq("recipe_id", data.recipe_id)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { snapshot: snap };
  });
