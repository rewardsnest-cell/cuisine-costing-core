// Pricing v2 — Stage 4 → 5 → 6 cron hook.
// Runs the full inventory-cost / recipe-cost / menu-price pipeline.
// Triggered by pg_cron. Auth not required (this is /api/public/*); operates
// with admin key directly.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin as _supabaseAdmin } from "@/integrations/supabase/client.server";

// Cast to any: this hook does internal inserts/updates with stage enum values
// and new tables whose generated types may lag. Runtime is enforced by DB constraints.
const supabaseAdmin = _supabaseAdmin as any;

async function createRun(stage: string, notes: string) {
  const { data } = await supabaseAdmin
    .from("pricing_v2_runs")
    .insert({ stage, status: "running", notes, initiated_by: null })
    .select("run_id")
    .single();
  return data?.run_id as string | undefined;
}

async function finishRun(runId: string | undefined, status: string, counts: any) {
  if (!runId) return;
  await supabaseAdmin
    .from("pricing_v2_runs")
    .update({ status, ended_at: new Date().toISOString(), ...counts })
    .eq("run_id", runId);
}

// Inline implementations using the admin client (no auth context here).
async function stage4(): Promise<{ run_id?: string; auto_applied: number; queued: number; blocked: number; recovered: number }> {
  const runId = await createRun("compute_costs", "Stage 4 — scheduled");
  const { data: settings } = await supabaseAdmin
    .from("pricing_v2_settings")
    .select("auto_apply_threshold_pct, enable_category_median_fallback")
    .eq("id", 1).maybeSingle();
  const threshold = Number(settings?.auto_apply_threshold_pct ?? 10);
  const medianEnabled = !!settings?.enable_category_median_fallback;

  const { data: items } = await supabaseAdmin
    .from("inventory_items")
    .select("id, name, category_for_median, cost_per_gram_live, last_approved_cost_per_gram, cost_equivalent_of");
  const itemIds = (items ?? []).map((i: any) => i.id);

  const signalsByItem = new Map<string, number[]>();
  if (itemIds.length) {
    const { data: sigs } = await supabaseAdmin
      .from("pricing_v2_cost_signals")
      .select("inventory_item_id, cost_per_gram")
      .in("inventory_item_id", itemIds)
      .eq("is_active", true);
    for (const s of sigs ?? []) {
      const v = Number(s.cost_per_gram);
      if (Number.isFinite(v) && v > 0) {
        const arr = signalsByItem.get(s.inventory_item_id) ?? [];
        arr.push(v);
        signalsByItem.set(s.inventory_item_id, arr);
      }
    }
  }

  const equivIds = (items ?? []).map((i: any) => i.cost_equivalent_of).filter(Boolean) as string[];
  const equivCost = new Map<string, number>();
  if (equivIds.length) {
    const { data: eq } = await supabaseAdmin
      .from("inventory_items")
      .select("id, cost_per_gram_live, last_approved_cost_per_gram")
      .in("id", equivIds);
    for (const e of eq ?? []) {
      const v = Number(e.cost_per_gram_live ?? e.last_approved_cost_per_gram);
      if (Number.isFinite(v) && v > 0) equivCost.set(e.id, v);
    }
  }

  const categoryMedian = new Map<string, number>();
  if (medianEnabled) {
    const { data: catRows } = await supabaseAdmin
      .from("inventory_items")
      .select("category_for_median, cost_per_gram_live")
      .not("category_for_median", "is", null)
      .not("cost_per_gram_live", "is", null);
    const buckets = new Map<string, number[]>();
    for (const r of catRows ?? []) {
      const v = Number(r.cost_per_gram_live);
      const cat = r.category_for_median as string;
      if (cat && Number.isFinite(v) && v > 0) {
        const arr = buckets.get(cat) ?? []; arr.push(v); buckets.set(cat, arr);
      }
    }
    for (const [cat, arr] of buckets.entries()) {
      arr.sort((a, b) => a - b);
      categoryMedian.set(cat, arr[Math.floor(arr.length / 2)]);
    }
  }

  let autoApplied = 0, queued = 0, blocked = 0, recovered = 0;

  for (const it of items ?? []) {
    const old = it.cost_per_gram_live != null ? Number(it.cost_per_gram_live) : null;
    let resolution: string | null = null;
    let newCost: number | null = null;
    let signalsCount = 0;
    const warnings: string[] = [];

    const sigs = signalsByItem.get(it.id) ?? [];
    if (sigs.length > 0) {
      newCost = sigs.reduce((a, b) => a + b, 0) / sigs.length;
      resolution = "signals"; signalsCount = sigs.length;
    }
    if (newCost == null && it.cost_equivalent_of && equivCost.has(it.cost_equivalent_of)) {
      newCost = equivCost.get(it.cost_equivalent_of)!; resolution = "explicit_equivalence";
      warnings.push("fallback:explicit_equivalence");
    }
    if (newCost == null && it.last_approved_cost_per_gram != null) {
      const v = Number(it.last_approved_cost_per_gram);
      if (Number.isFinite(v) && v > 0) {
        newCost = v; resolution = "last_approved"; warnings.push("fallback:last_approved");
      }
    }
    if (newCost == null && medianEnabled && it.category_for_median && categoryMedian.has(it.category_for_median)) {
      newCost = categoryMedian.get(it.category_for_median)!;
      resolution = "category_median"; warnings.push("fallback:category_median");
    }
    if (newCost == null || !(newCost > 0)) {
      blocked++;
      await supabaseAdmin.from("inventory_items").update({
        pricing_status: "BLOCKED_MISSING_COST",
        pricing_status_updated_at: new Date().toISOString(),
      }).eq("id", it.id);
      continue;
    }

    const pct = old != null && old > 0 ? Math.abs(newCost - old) / old : null;
    const requiresReview = resolution !== "signals" || (pct != null && pct >= threshold / 100);
    if (resolution !== "signals") recovered++;

    const status = requiresReview ? "pending" : "auto_applied";
    const { data: q } = await supabaseAdmin.from("pricing_v2_cost_update_queue").insert({
      run_id: runId, inventory_item_id: it.id,
      old_cost_per_gram: old, new_computed_cost_per_gram: newCost,
      resolution_source: resolution, pct_change: pct, requires_review: requiresReview,
      warning_flags: warnings, signals_count: signalsCount, status,
      decided_at: status === "auto_applied" ? new Date().toISOString() : null,
    }).select("id").single();

    if (status === "auto_applied") {
      const newStatus = resolution === "signals" ? "OK" : "DEGRADED_FALLBACK";
      await supabaseAdmin.from("inventory_items").update({
        cost_per_gram_live: newCost,
        last_approved_cost_per_gram: newCost,
        pricing_status: newStatus,
        pricing_status_updated_at: new Date().toISOString(),
      }).eq("id", it.id);
      await supabaseAdmin.from("pricing_v2_cost_apply_log").insert({
        queue_id: q?.id ?? null, inventory_item_id: it.id,
        old_cost_per_gram: old, new_cost_per_gram: newCost,
        resolution_source: resolution!, pct_change: pct,
        applied_via: "auto", notes: "Cron auto-apply",
      });
      autoApplied++;
    } else {
      queued++;
    }
  }

  await finishRun(runId, "success", {
    counts_in: items?.length ?? 0,
    counts_out: autoApplied + queued,
    warnings_count: recovered, errors_count: blocked,
  });
  return { run_id: runId, auto_applied: autoApplied, queued, blocked, recovered };
}

async function stage5(): Promise<{ run_id?: string; ok: number; warning: number; blocked: number }> {
  const runId = await createRun("rollups", "Stage 5 — scheduled");
  const { data: recipes } = await supabaseAdmin.from("recipes").select("id, servings").eq("active", true);
  const recipeIds = (recipes ?? []).map((r: any) => r.id);
  if (!recipeIds.length) {
    await finishRun(runId, "success", { counts_in: 0, counts_out: 0 });
    return { run_id: runId, ok: 0, warning: 0, blocked: 0 };
  }
  const { data: ingredients } = await supabaseAdmin
    .from("recipe_ingredients")
    .select("recipe_id, name, quantity_grams, inventory_item_id")
    .in("recipe_id", recipeIds);
  const invIds = Array.from(new Set((ingredients ?? []).map((i: any) => i.inventory_item_id).filter(Boolean))) as string[];
  const invMap = new Map<string, { cpg: number | null; status: string; name: string }>();
  if (invIds.length) {
    const { data: inv } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, cost_per_gram_live, pricing_status")
      .in("id", invIds);
    for (const r of inv ?? []) {
      invMap.set(r.id, {
        cpg: r.cost_per_gram_live != null ? Number(r.cost_per_gram_live) : null,
        status: r.pricing_status, name: r.name,
      });
    }
  }
  const ingByRecipe = new Map<string, any[]>();
  for (const ing of ingredients ?? []) {
    const arr = ingByRecipe.get(ing.recipe_id) ?? []; arr.push(ing); ingByRecipe.set(ing.recipe_id, arr);
  }
  await supabaseAdmin.from("pricing_v2_recipe_costs").update({ is_current: false })
    .in("recipe_id", recipeIds).eq("is_current", true);

  let ok = 0, warning = 0, blocked = 0;
  const snapshots: any[] = [];
  for (const recipe of recipes ?? []) {
    const ings = ingByRecipe.get(recipe.id) ?? [];
    const breakdown: any[] = [];
    const blockers: string[] = []; const warns: string[] = [];
    const contributingInv = new Set<string>();
    let total = 0; let isBlocked = ings.length === 0;
    if (ings.length === 0) blockers.push("NO_INGREDIENTS");
    for (const ing of ings) {
      const grams = ing.quantity_grams != null ? Number(ing.quantity_grams) : null;
      if (!grams || grams <= 0) {
        isBlocked = true; blockers.push(`ZERO_OR_NEGATIVE_GRAMS:${ing.name}`);
        breakdown.push({ name: ing.name, grams, cost_per_gram: null, ingredient_cost: null, source: "missing_grams", status: "BLOCKED" });
        continue;
      }
      if (!ing.inventory_item_id) {
        isBlocked = true; blockers.push(`MISSING_INGREDIENT_COST:${ing.name}`);
        breakdown.push({ name: ing.name, grams, cost_per_gram: null, ingredient_cost: null, source: "unmapped", status: "BLOCKED" });
        continue;
      }
      const inv = invMap.get(ing.inventory_item_id);
      if (!inv || inv.status === "BLOCKED_MISSING_COST" || inv.cpg == null) {
        isBlocked = true; blockers.push(`MISSING_INGREDIENT_COST:${ing.name}`);
        breakdown.push({ name: ing.name, grams, cost_per_gram: null, ingredient_cost: null, source: "blocked_inventory", status: "BLOCKED", inventory_item_id: ing.inventory_item_id, inventory_name: inv?.name });
        continue;
      }
      const ic = grams * inv.cpg; total += ic;
      contributingInv.add(ing.inventory_item_id);
      if (inv.status === "DEGRADED_FALLBACK") warns.push(`DEGRADED_INGREDIENT:${ing.name}`);
      breakdown.push({
        name: ing.name, grams, cost_per_gram: inv.cpg, ingredient_cost: ic,
        source: inv.status === "DEGRADED_FALLBACK" ? "fallback" : "live",
        status: inv.status === "DEGRADED_FALLBACK" ? "WARNING" : "OK",
        inventory_item_id: ing.inventory_item_id, inventory_name: inv.name,
      });
    }
    const servings = Math.max(Number(recipe.servings) || 1, 1);
    const status = isBlocked ? "BLOCKED" : warns.length ? "WARNING" : "OK";
    if (status === "BLOCKED") blocked++; else if (status === "WARNING") warning++; else ok++;
    snapshots.push({
      recipe_id: recipe.id, run_id: runId,
      total_cost: isBlocked ? null : Math.round(total * 10000) / 10000,
      cost_per_serving: isBlocked ? null : Math.round((total / servings) * 10000) / 10000,
      servings, status, blocker_reasons: blockers, warning_flags: warns,
      ingredient_breakdown: breakdown,
      contributing_inventory_item_ids: Array.from(contributingInv),
      is_current: true,
    });
  }
  for (let i = 0; i < snapshots.length; i += 100) {
    await supabaseAdmin.from("pricing_v2_recipe_costs").insert(snapshots.slice(i, i + 100));
  }
  await finishRun(runId, "success", { counts_in: recipes?.length ?? 0, counts_out: snapshots.length, warnings_count: warning, errors_count: blocked });
  return { run_id: runId, ok, warning, blocked };
}

async function stage6(): Promise<{ run_id?: string; ok: number; warning: number; blocked: number }> {
  const runId = await createRun("rollups", "Stage 6 — scheduled");
  const { data: settings } = await supabaseAdmin.from("pricing_v2_settings").select("default_menu_multiplier").eq("id", 1).maybeSingle();
  const mult = Number(settings?.default_menu_multiplier ?? 3);

  const { data: rows } = await supabaseAdmin
    .from("pricing_v2_recipe_costs")
    .select("recipe_id, cost_per_serving, status, contributing_inventory_item_ids")
    .eq("is_current", true);

  let ok = 0, warning = 0, blocked = 0;
  const snapshots: any[] = [];
  for (const r of rows ?? []) {
    const cps = r.cost_per_serving != null ? Number(r.cost_per_serving) : null;
    let status: "OK" | "WARNING" | "BLOCKED" = "OK";
    let menuPrice: number | null = null;
    const warns: string[] = [];
    if (r.status === "BLOCKED" || cps == null) { status = "BLOCKED"; warns.push("recipe_blocked"); }
    else { menuPrice = Math.round(cps * mult * 100) / 100; if (r.status === "WARNING") { status = "WARNING"; warns.push("recipe_warning"); } }
    if (status === "OK") ok++; else if (status === "WARNING") warning++; else blocked++;
    snapshots.push({
      recipe_id: r.recipe_id, scope: "recipe_menu", run_id: runId,
      recipe_cost_per_serving: cps, multiplier: mult, multiplier_source: "default",
      menu_price: menuPrice, status, warning_flags: warns,
      contributing_inventory_item_ids: r.contributing_inventory_item_ids ?? [],
      is_current: true, frozen: false,
    });
  }
  if (snapshots.length) {
    const ids = snapshots.map((s: any) => s.recipe_id);
    await supabaseAdmin.from("pricing_v2_menu_prices")
      .update({ is_current: false })
      .eq("scope", "recipe_menu").in("recipe_id", ids).eq("is_current", true).eq("frozen", false);
    for (let i = 0; i < snapshots.length; i += 100) {
      await supabaseAdmin.from("pricing_v2_menu_prices").insert(snapshots.slice(i, i + 100));
    }
  }
  await finishRun(runId, "success", { counts_in: snapshots.length, counts_out: snapshots.length, warnings_count: warning, errors_count: blocked });
  return { run_id: runId, ok, warning, blocked };
}

export const Route = createFileRoute("/api/public/hooks/pricing-v2-stage456")({
  server: {
    handlers: {
      POST: async () => {
        const { data: settings } = await supabaseAdmin
          .from("pricing_v2_settings")
          .select("stage456_cron_enabled")
          .eq("id", 1).maybeSingle();
        if (settings && settings.stage456_cron_enabled === false) {
          return new Response(JSON.stringify({ ok: true, skipped: "cron_disabled" }), {
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const s4 = await stage4();
          const s5 = await stage5();
          const s6 = await stage6();
          return new Response(JSON.stringify({ ok: true, stage4: s4, stage5: s5, stage6: s6 }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
