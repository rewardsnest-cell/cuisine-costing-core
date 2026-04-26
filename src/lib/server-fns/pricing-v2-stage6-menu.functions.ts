// Pricing v2 — Stage 6: Menu / Quote pricing using multipliers.
// Reads pricing_v2_recipe_costs (current snapshot) and applies a multiplier.
// Writes immutable snapshots to pricing_v2_menu_prices.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runStage6MenuPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    scope: z.enum(["recipe_menu", "quote_item", "all"]).default("all"),
    recipe_ids: z.array(z.string().uuid()).optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: settings } = await supabase
      .from("pricing_v2_settings")
      .select("default_menu_multiplier")
      .eq("id", 1)
      .maybeSingle();
    const defaultMultiplier = Number(settings?.default_menu_multiplier ?? 3);

    const { data: runRow, error: runErr } = await supabase
      .from("pricing_v2_runs")
      .insert({
        stage: "rollups",
        status: "running",
        initiated_by: userId ?? null,
        notes: "Stage 6 — menu/quote pricing",
      })
      .select("run_id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId = runRow.run_id as string;

    let okCount = 0, blockedCount = 0, warningCount = 0;
    const snapshots: any[] = [];

    // ---- Recipe menu prices (one row per active recipe with current cost) ----
    if (data.scope === "recipe_menu" || data.scope === "all") {
      let q = supabase
        .from("pricing_v2_recipe_costs")
        .select("recipe_id, cost_per_serving, status, contributing_inventory_item_ids, recipes!inner(id, menu_price)")
        .eq("is_current", true);
      if (data.recipe_ids?.length) q = q.in("recipe_id", data.recipe_ids);
      const { data: rows } = await q;
      for (const r of rows ?? []) {
        const cps = r.cost_per_serving != null ? Number(r.cost_per_serving) : null;
        let status: "OK" | "WARNING" | "BLOCKED" = "OK";
        let menuPrice: number | null = null;
        const warns: string[] = [];
        if (r.status === "BLOCKED" || cps == null) {
          status = "BLOCKED";
          warns.push("recipe_blocked");
        } else {
          menuPrice = Math.round(cps * defaultMultiplier * 100) / 100;
          if (r.status === "WARNING") { status = "WARNING"; warns.push("recipe_warning"); }
        }
        snapshots.push({
          recipe_id: r.recipe_id,
          quote_item_id: null,
          scope: "recipe_menu",
          run_id: runId,
          recipe_cost_per_serving: cps,
          multiplier: defaultMultiplier,
          multiplier_source: "default",
          menu_price: menuPrice,
          status,
          warning_flags: warns,
          contributing_inventory_item_ids: r.contributing_inventory_item_ids ?? [],
          is_current: true,
          frozen: false,
        });
        if (status === "OK") okCount++;
        else if (status === "WARNING") warningCount++;
        else blockedCount++;
      }
    }

    // ---- Quote items (skip already-frozen quotes) ----
    if (data.scope === "quote_item" || data.scope === "all") {
      const { data: items } = await supabase
        .from("quote_items")
        .select("id, recipe_id, quantity, quotes!inner(id, status)")
        .not("recipe_id", "is", null);

      // Exclude quotes that are sent/accepted/etc — only price drafts.
      const draftStatuses = new Set(["draft", "in_progress", null, undefined]);
      const eligible = (items ?? []).filter((it: any) => draftStatuses.has(it.quotes?.status));

      const recipeIdsNeeded = Array.from(new Set(eligible.map((i: any) => i.recipe_id))) as string[];
      const cpsMap = new Map<string, { cps: number | null; status: string }>();
      if (recipeIdsNeeded.length) {
        const { data: cosrs } = await supabase
          .from("pricing_v2_recipe_costs")
          .select("recipe_id, cost_per_serving, status")
          .in("recipe_id", recipeIdsNeeded)
          .eq("is_current", true);
        for (const r of cosrs ?? []) {
          cpsMap.set(r.recipe_id, {
            cps: r.cost_per_serving != null ? Number(r.cost_per_serving) : null,
            status: r.status,
          });
        }
      }

      for (const it of eligible) {
        const ref = cpsMap.get(it.recipe_id);
        let status: "OK" | "WARNING" | "BLOCKED" = "OK";
        let menuPrice: number | null = null;
        const warns: string[] = [];
        if (!ref || ref.status === "BLOCKED" || ref.cps == null) {
          status = "BLOCKED";
          warns.push("recipe_blocked");
        } else {
          menuPrice = Math.round(ref.cps * defaultMultiplier * 100) / 100;
          if (ref.status === "WARNING") { status = "WARNING"; warns.push("recipe_warning"); }
        }
        snapshots.push({
          recipe_id: it.recipe_id,
          quote_item_id: it.id,
          scope: "quote_item",
          run_id: runId,
          recipe_cost_per_serving: ref?.cps ?? null,
          multiplier: defaultMultiplier,
          multiplier_source: "default",
          menu_price: menuPrice,
          status,
          warning_flags: warns,
          is_current: true,
          frozen: false,
        });
        if (status === "OK") okCount++;
        else if (status === "WARNING") warningCount++;
        else blockedCount++;
      }
    }

    // Mark prior current snapshots in scope as no longer current.
    if (snapshots.length) {
      const recipeMenuIds = snapshots.filter(s => s.scope === "recipe_menu").map(s => s.recipe_id);
      const quoteItemIds = snapshots.filter(s => s.scope === "quote_item").map(s => s.quote_item_id);
      if (recipeMenuIds.length) {
        await supabase.from("pricing_v2_menu_prices")
          .update({ is_current: false })
          .eq("scope", "recipe_menu")
          .in("recipe_id", recipeMenuIds)
          .eq("is_current", true)
          .eq("frozen", false);
      }
      if (quoteItemIds.length) {
        await supabase.from("pricing_v2_menu_prices")
          .update({ is_current: false })
          .eq("scope", "quote_item")
          .in("quote_item_id", quoteItemIds)
          .eq("is_current", true)
          .eq("frozen", false);
      }
      for (let i = 0; i < snapshots.length; i += 100) {
        await supabase.from("pricing_v2_menu_prices").insert(snapshots.slice(i, i + 100));
      }
    }

    await supabase.from("pricing_v2_runs").update({
      status: "success",
      ended_at: new Date().toISOString(),
      counts_in: snapshots.length,
      counts_out: snapshots.length,
      warnings_count: warningCount,
      errors_count: blockedCount,
    }).eq("run_id", runId);

    return {
      run_id: runId,
      priced: okCount + warningCount,
      ok: okCount,
      warning: warningCount,
      blocked: blockedCount,
    };
  });

// ---- Multiplier override on a single recipe (future prices only) -----------

export const setRecipeMultiplierOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    recipe_id: z.string().uuid(),
    multiplier: z.number().min(0.1).max(50),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Get current cost snapshot.
    const { data: snap } = await supabase
      .from("pricing_v2_recipe_costs")
      .select("cost_per_serving, status")
      .eq("recipe_id", data.recipe_id)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cps = snap?.cost_per_serving != null ? Number(snap.cost_per_serving) : null;
    const blocked = !snap || snap.status === "BLOCKED" || cps == null;
    const menuPrice = blocked ? null : Math.round(cps! * data.multiplier * 100) / 100;

    // Mark prior current as not current (non-frozen only).
    await supabase.from("pricing_v2_menu_prices")
      .update({ is_current: false })
      .eq("scope", "recipe_menu")
      .eq("recipe_id", data.recipe_id)
      .eq("is_current", true)
      .eq("frozen", false);

    await supabase.from("pricing_v2_menu_prices").insert({
      recipe_id: data.recipe_id,
      scope: "recipe_menu",
      recipe_cost_per_serving: cps,
      multiplier: data.multiplier,
      multiplier_source: "override",
      menu_price: menuPrice,
      status: blocked ? "BLOCKED" : "OK",
      warning_flags: blocked ? ["recipe_blocked"] : [],
      is_current: true,
      frozen: false,
    });

    return { ok: true, menu_price: menuPrice };
  });

export const listMenuPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    scope: z.enum(["recipe_menu", "quote_item", "all"]).default("recipe_menu"),
    status: z.enum(["OK", "WARNING", "BLOCKED", "all"]).default("all"),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_menu_prices")
      .select("*, recipes(id, name)")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.scope !== "all") q = q.eq("scope", data.scope);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
