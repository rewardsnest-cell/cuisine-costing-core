// Pricing Engine v3 — admin server functions.
// All routes are admin-only. The only external pricing source is the
// Grocery Pricing API (RapidAPI). All math flows through:
//   IngredientService -> PriceService -> RecipeCostService

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALLOWED_BASE_UNITS, convertQty } from "@/lib/server/pricing-engine/units";
import { fetchGroceryPrice } from "@/lib/server/pricing-engine/grocery-api";
import {
  discoverPrices,
  pickBestPrice,
  confidenceFromScore,
} from "@/lib/server/pricing-engine/price-discovery";

const STALE_AFTER_DAYS = 7;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(`Auth check failed: ${error.message}`);
  if (!data) throw new Error("Admin role required");
}

// ---------- IngredientService ----------

export const peListIngredients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: ingredients, error } = await supabaseAdmin
      .from("pe_ingredients")
      .select("*")
      .order("canonical_name");
    if (error) throw new Error(error.message);
    const { data: aliases } = await supabaseAdmin
      .from("pe_ingredient_aliases")
      .select("*");
    return { ingredients: ingredients ?? [], aliases: aliases ?? [] };
  });

const upsertIngredientSchema = z.object({
  id: z.string().uuid().optional(),
  canonical_name: z.string().min(1).max(120),
  base_unit: z.enum(ALLOWED_BASE_UNITS as unknown as [string, ...string[]]),
  category: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  aliases: z.array(z.string().min(1).max(120)).max(50).optional(),
});

export const peUpsertIngredient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertIngredientSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { aliases, id, ...row } = data;

    let ingredientId = id;
    if (id) {
      const { error } = await supabaseAdmin
        .from("pe_ingredients")
        .update(row)
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("pe_ingredients")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      ingredientId = ins!.id;
    }

    if (aliases && ingredientId) {
      // replace alias set
      await supabaseAdmin.from("pe_ingredient_aliases").delete().eq("ingredient_id", ingredientId);
      if (aliases.length > 0) {
        const rows = aliases.map((a) => ({ ingredient_id: ingredientId!, alias: a.toLowerCase().trim() }));
        const { error } = await supabaseAdmin.from("pe_ingredient_aliases").insert(rows);
        if (error) throw new Error(`Alias save failed: ${error.message}`);
      }
    }
    return { id: ingredientId };
  });

export const peDeleteIngredient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("pe_ingredients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- PriceService ----------

export const peListPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [ingRes, priceRes] = await Promise.all([
      supabaseAdmin.from("pe_ingredients").select("id, canonical_name, base_unit, category"),
      supabaseAdmin.from("pe_ingredient_prices").select("*"),
    ]);
    if (ingRes.error) throw new Error(ingRes.error.message);
    if (priceRes.error) throw new Error(priceRes.error.message);
    const priceMap = new Map((priceRes.data ?? []).map((p) => [p.ingredient_id, p]));
    const now = Date.now();
    const rows = (ingRes.data ?? []).map((ing) => {
      const p = priceMap.get(ing.id);
      const ageDays = p?.last_updated
        ? (now - new Date(p.last_updated).getTime()) / 86_400_000
        : null;
      return {
        ingredient: ing,
        price: p ?? null,
        is_stale: ageDays != null && ageDays > STALE_AFTER_DAYS,
        age_days: ageDays,
      };
    });
    return { rows };
  });

async function refreshOne(ingredientId: string, canonicalName: string, baseUnit: string, userId: string) {
  try {
    const { raw } = await fetchGroceryPrice(canonicalName);
    const candidates = discoverPrices(raw);
    const best = candidates[0] ?? null;

    if (!best) {
      await supabaseAdmin.from("pe_ingredient_prices").upsert({
        ingredient_id: ingredientId,
        status: "price_missing",
        raw_sample_json: raw as any,
        discovered_field_path: null,
        confidence_score: 0,
        last_updated: new Date().toISOString(),
        last_error: "No plausible price field discovered",
        is_manual_override: false,
        source: "grocery_pricing_api",
      });
      return { ok: false, reason: "no_price" };
    }

    // Normalize to base unit if a unit hint exists; otherwise assume the price
    // is already per the ingredient's base unit (best-effort, conservative).
    let pricePerBase = best.value;
    if (best.unitHint) {
      const conv = convertQty(1, baseUnit, best.unitHint);
      // If 1 baseUnit = `conv` of unitHint, then price/baseUnit = price * conv
      if (conv != null) pricePerBase = best.value * conv;
    }

    const confidence = confidenceFromScore(best.score, candidates.length);

    const updateRow = {
      ingredient_id: ingredientId,
      price_per_base_unit: pricePerBase,
      currency: "USD",
      source: "grocery_pricing_api",
      raw_sample_json: raw as any,
      discovered_field_path: best.path,
      confidence_score: confidence,
      is_manual_override: false,
      override_note: null,
      status: "ok" as const,
      last_error: null,
      last_updated: new Date().toISOString(),
    };
    const { error: upErr } = await supabaseAdmin.from("pe_ingredient_prices").upsert(updateRow);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("pe_price_history").insert({
      ingredient_id: ingredientId,
      price_per_base_unit: pricePerBase,
      currency: "USD",
      source: "grocery_pricing_api",
      discovered_field_path: best.path,
      confidence_score: confidence,
      is_manual_override: false,
      changed_by: userId,
    });

    return { ok: true, price: pricePerBase, path: best.path, confidence };
  } catch (e: any) {
    await supabaseAdmin.from("pe_ingredient_prices").upsert({
      ingredient_id: ingredientId,
      status: "error",
      last_error: e?.message ?? String(e),
      last_updated: new Date().toISOString(),
      source: "grocery_pricing_api",
    });
    return { ok: false, reason: "error", error: e?.message };
  }
}

export const peRefreshPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      ingredient_ids: z.array(z.string().uuid()).max(100).optional(),
      force: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: ingredients, error } = await supabaseAdmin
      .from("pe_ingredients")
      .select("id, canonical_name, base_unit")
      .order("canonical_name");
    if (error) throw new Error(error.message);

    const targetIds = new Set(data.ingredient_ids ?? []);
    const targets = (ingredients ?? []).filter(
      (i) => targetIds.size === 0 || targetIds.has(i.id),
    );

    const results: Array<{ ingredient_id: string; ok: boolean; reason?: string; error?: string }> = [];
    for (const ing of targets) {
      const r = await refreshOne(ing.id, ing.canonical_name, ing.base_unit, context.userId);
      results.push({ ingredient_id: ing.id, ...r });
    }
    return { processed: results.length, results };
  });

const overrideSchema = z.object({
  ingredient_id: z.string().uuid(),
  price_per_base_unit: z.number().positive().max(99999),
  note: z.string().min(3).max(500),
});

export const peManualOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: prev } = await supabaseAdmin
      .from("pe_ingredient_prices")
      .select("price_per_base_unit")
      .eq("ingredient_id", data.ingredient_id)
      .maybeSingle();

    const { error: upErr } = await supabaseAdmin.from("pe_ingredient_prices").upsert({
      ingredient_id: data.ingredient_id,
      price_per_base_unit: data.price_per_base_unit,
      currency: "USD",
      source: "manual_override",
      is_manual_override: true,
      override_note: data.note,
      status: "ok",
      last_error: null,
      last_updated: new Date().toISOString(),
    });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("pe_price_history").insert({
      ingredient_id: data.ingredient_id,
      price_per_base_unit: data.price_per_base_unit,
      currency: "USD",
      source: "manual_override",
      is_manual_override: true,
      override_note: data.note,
      changed_by: context.userId,
    });

    await supabaseAdmin.from("pe_price_overrides_audit").insert({
      ingredient_id: data.ingredient_id,
      previous_price: prev?.price_per_base_unit ?? null,
      new_price: data.price_per_base_unit,
      note: data.note,
      admin_user_id: context.userId,
    });
    return { ok: true };
  });

export const peGetPriceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ingredient_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("pe_price_history")
      .select("*")
      .eq("ingredient_id", data.ingredient_id)
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });

export const peStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: prices, error } = await supabaseAdmin
      .from("pe_ingredient_prices")
      .select("status, last_updated, confidence_score, is_manual_override");
    if (error) throw new Error(error.message);

    const { count: ingredientCount } = await supabaseAdmin
      .from("pe_ingredients")
      .select("*", { count: "exact", head: true });

    const now = Date.now();
    const stats = {
      total_ingredients: ingredientCount ?? 0,
      priced: 0,
      missing: 0,
      errored: 0,
      stale: 0,
      manual: 0,
      avg_confidence: 0,
      api_key_configured: !!process.env.RAPIDAPI_KEY,
    };
    let confSum = 0; let confN = 0;
    for (const p of prices ?? []) {
      if (p.status === "ok") stats.priced++;
      if (p.status === "price_missing") stats.missing++;
      if (p.status === "error") stats.errored++;
      if (p.is_manual_override) stats.manual++;
      const ageDays = p.last_updated
        ? (now - new Date(p.last_updated).getTime()) / 86_400_000
        : null;
      if (ageDays != null && ageDays > STALE_AFTER_DAYS) stats.stale++;
      if (p.confidence_score != null) { confSum += Number(p.confidence_score); confN++; }
    }
    stats.avg_confidence = confN > 0 ? Math.round((confSum / confN) * 1000) / 1000 : 0;
    stats.missing += Math.max(0, (ingredientCount ?? 0) - (prices?.length ?? 0));

    return { stats };
  });

// ---------- RecipeCostService ----------

const recipeCostSchema = z.object({
  servings: z.number().int().positive().max(10000),
  ingredients: z
    .array(
      z.object({
        ingredient_id: z.string().uuid(),
        quantity: z.number().positive().max(99999),
        unit: z.string().min(1).max(32),
      }),
    )
    .min(1)
    .max(200),
});

export const peComputeRecipeCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recipeCostSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ids = data.ingredients.map((i) => i.ingredient_id);

    const [ingRes, priceRes] = await Promise.all([
      supabaseAdmin.from("pe_ingredients").select("id, canonical_name, base_unit").in("id", ids),
      supabaseAdmin.from("pe_ingredient_prices").select("*").in("ingredient_id", ids),
    ]);
    if (ingRes.error) throw new Error(ingRes.error.message);
    if (priceRes.error) throw new Error(priceRes.error.message);

    const ingMap = new Map((ingRes.data ?? []).map((r) => [r.id, r]));
    const priceMap = new Map((priceRes.data ?? []).map((r) => [r.ingredient_id, r]));

    const lines: Array<{
      ingredient_id: string;
      canonical_name: string | null;
      quantity: number;
      unit: string;
      base_unit: string | null;
      quantity_in_base_unit: number | null;
      price_per_base_unit: number | null;
      line_cost: number | null;
      missing_reason: string | null;
    }> = [];

    let total = 0;
    let anyMissing = false;
    for (const item of data.ingredients) {
      const ing = ingMap.get(item.ingredient_id);
      const price = priceMap.get(item.ingredient_id);
      let qtyBase: number | null = null;
      let lineCost: number | null = null;
      let missing: string | null = null;

      if (!ing) missing = "ingredient_not_found";
      else if (!price || price.price_per_base_unit == null) missing = "price_missing";
      else {
        qtyBase = convertQty(item.quantity, item.unit, ing.base_unit);
        if (qtyBase == null) missing = `cannot_convert_${item.unit}_to_${ing.base_unit}`;
        else {
          lineCost = qtyBase * Number(price.price_per_base_unit);
          total += lineCost;
        }
      }

      if (missing) anyMissing = true;
      lines.push({
        ingredient_id: item.ingredient_id,
        canonical_name: ing?.canonical_name ?? null,
        quantity: item.quantity,
        unit: item.unit,
        base_unit: ing?.base_unit ?? null,
        quantity_in_base_unit: qtyBase,
        price_per_base_unit: price?.price_per_base_unit != null ? Number(price.price_per_base_unit) : null,
        line_cost: lineCost,
        missing_reason: missing,
      });
    }

    return {
      lines,
      recipe_cost: anyMissing ? null : Math.round(total * 100) / 100,
      cost_per_person: anyMissing ? null : Math.round((total / data.servings) * 100) / 100,
      servings: data.servings,
      complete: !anyMissing,
    };
  });

// ---------- CSV Import ----------
// Accepted columns (case-insensitive, header row required):
//   ingredient (required)        — canonical name OR alias
//   price (required)             — numeric, USD
//   unit (optional)              — unit the price is per (e.g. lb, oz, kg, each).
//                                  If omitted, price is assumed to already be per ingredient base unit.
//   note (optional)              — audit note (defaults to "CSV import <timestamp>")

const csvImportSchema = z.object({
  rows: z
    .array(
      z.object({
        ingredient: z.string().min(1).max(200),
        price: z.number().positive().max(99999),
        unit: z.string().max(32).optional().nullable(),
        note: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(2000),
  default_note: z.string().max(500).optional(),
  dry_run: z.boolean().optional(),
});

type CsvImportResultRow = {
  input_ingredient: string;
  input_price: number;
  input_unit: string | null;
  matched_ingredient_id: string | null;
  matched_canonical_name: string | null;
  base_unit: string | null;
  price_per_base_unit: number | null;
  status: "ok" | "not_found" | "ambiguous" | "bad_unit" | "error";
  message: string | null;
};

export const peImportPricesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => csvImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Build lookup maps once
    const [ingRes, aliasRes] = await Promise.all([
      supabaseAdmin.from("pe_ingredients").select("id, canonical_name, base_unit"),
      supabaseAdmin.from("pe_ingredient_aliases").select("ingredient_id, alias"),
    ]);
    if (ingRes.error) throw new Error(ingRes.error.message);
    if (aliasRes.error) throw new Error(aliasRes.error.message);

    const byCanonical = new Map<string, { id: string; canonical_name: string; base_unit: string }>();
    for (const ing of ingRes.data ?? []) {
      byCanonical.set(ing.canonical_name.toLowerCase().trim(), ing);
    }
    const byAlias = new Map<string, string>(); // alias -> ingredient_id
    for (const a of aliasRes.data ?? []) {
      byAlias.set(a.alias.toLowerCase().trim(), a.ingredient_id);
    }
    const ingById = new Map((ingRes.data ?? []).map((i) => [i.id, i]));

    const results: CsvImportResultRow[] = [];
    const toUpsert: any[] = [];
    const toHistory: any[] = [];
    const toAudit: any[] = [];
    const defaultNote = data.default_note?.trim() || `CSV import ${new Date().toISOString()}`;

    // Cache previous prices to populate audit "previous_price" column
    const previousPriceMap = new Map<string, number | null>();
    {
      const ids = (ingRes.data ?? []).map((i) => i.id);
      if (ids.length > 0) {
        const { data: prev } = await supabaseAdmin
          .from("pe_ingredient_prices")
          .select("ingredient_id, price_per_base_unit")
          .in("ingredient_id", ids);
        for (const p of prev ?? []) {
          previousPriceMap.set(
            p.ingredient_id,
            p.price_per_base_unit != null ? Number(p.price_per_base_unit) : null,
          );
        }
      }
    }

    for (const row of data.rows) {
      const key = row.ingredient.toLowerCase().trim();
      const direct = byCanonical.get(key);
      const aliasId = byAlias.get(key);
      const ing = direct ?? (aliasId ? ingById.get(aliasId) : undefined);

      if (!ing) {
        results.push({
          input_ingredient: row.ingredient,
          input_price: row.price,
          input_unit: row.unit ?? null,
          matched_ingredient_id: null,
          matched_canonical_name: null,
          base_unit: null,
          price_per_base_unit: null,
          status: "not_found",
          message: "No canonical ingredient or alias matched. Add it on the Ingredients tab first.",
        });
        continue;
      }

      // Convert price to per-base-unit if a source unit is provided.
      // If the user gives "$2.50/lb" and base_unit is "oz", we need price per oz:
      //   price_per_base = price_per_unit × (1 unit_in_base_units)^-1
      //   (1 of unit  ->  X of base)  =>  price/base = price/unit * (unit/base)
      //   Easier: 1 base_unit = convertQty(1, base_unit, unit) of unit
      //           => price_per_base = price_per_unit * convertQty(1, base_unit, unit)
      let pricePerBase = row.price;
      if (row.unit && row.unit.trim().length > 0) {
        const conv = convertQty(1, ing.base_unit, row.unit.trim());
        if (conv == null) {
          results.push({
            input_ingredient: row.ingredient,
            input_price: row.price,
            input_unit: row.unit,
            matched_ingredient_id: ing.id,
            matched_canonical_name: ing.canonical_name,
            base_unit: ing.base_unit,
            price_per_base_unit: null,
            status: "bad_unit",
            message: `Cannot convert ${row.unit} → ${ing.base_unit} (different dimension).`,
          });
          continue;
        }
        pricePerBase = row.price * conv;
      }

      const note = row.note?.trim() || defaultNote;
      const nowIso = new Date().toISOString();

      toUpsert.push({
        ingredient_id: ing.id,
        price_per_base_unit: pricePerBase,
        currency: "USD",
        source: "csv_import",
        is_manual_override: true,
        override_note: note,
        status: "ok",
        last_error: null,
        last_updated: nowIso,
      });
      toHistory.push({
        ingredient_id: ing.id,
        price_per_base_unit: pricePerBase,
        currency: "USD",
        source: "csv_import",
        is_manual_override: true,
        override_note: note,
        changed_by: context.userId,
      });
      toAudit.push({
        ingredient_id: ing.id,
        previous_price: previousPriceMap.get(ing.id) ?? null,
        new_price: pricePerBase,
        note,
        admin_user_id: context.userId,
      });

      results.push({
        input_ingredient: row.ingredient,
        input_price: row.price,
        input_unit: row.unit ?? null,
        matched_ingredient_id: ing.id,
        matched_canonical_name: ing.canonical_name,
        base_unit: ing.base_unit,
        price_per_base_unit: pricePerBase,
        status: "ok",
        message: null,
      });
    }

    if (!data.dry_run && toUpsert.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("pe_ingredient_prices")
        .upsert(toUpsert);
      if (upErr) throw new Error(`Price upsert failed: ${upErr.message}`);

      const { error: histErr } = await supabaseAdmin
        .from("pe_price_history")
        .insert(toHistory);
      if (histErr) throw new Error(`History insert failed: ${histErr.message}`);

      const { error: auditErr } = await supabaseAdmin
        .from("pe_price_overrides_audit")
        .insert(toAudit);
      if (auditErr) throw new Error(`Audit insert failed: ${auditErr.message}`);
    }

    const summary = {
      total: results.length,
      applied: data.dry_run ? 0 : toUpsert.length,
      ok: results.filter((r) => r.status === "ok").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      bad_unit: results.filter((r) => r.status === "bad_unit").length,
      dry_run: !!data.dry_run,
    };
    return { summary, results };
  });

// ---------- Overview ----------

export const peOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // Stats (mirrors peStatus)
    const { data: prices } = await supabaseAdmin
      .from("pe_ingredient_prices")
      .select("status, last_updated, confidence_score, is_manual_override");
    const { count: ingredientCount } = await supabaseAdmin
      .from("pe_ingredients")
      .select("*", { count: "exact", head: true });

    const now = Date.now();
    const stats = {
      total_ingredients: ingredientCount ?? 0,
      priced: 0,
      missing: 0,
      errored: 0,
      stale: 0,
      manual: 0,
      avg_confidence: 0,
      api_key_configured: !!process.env.RAPIDAPI_KEY,
    };
    let confSum = 0;
    let confN = 0;
    for (const p of prices ?? []) {
      if (p.status === "ok") stats.priced++;
      if (p.status === "price_missing") stats.missing++;
      if (p.status === "error") stats.errored++;
      if (p.is_manual_override) stats.manual++;
      const ageDays = p.last_updated
        ? (now - new Date(p.last_updated).getTime()) / 86_400_000
        : null;
      if (ageDays != null && ageDays > STALE_AFTER_DAYS) stats.stale++;
      if (p.confidence_score != null) {
        confSum += Number(p.confidence_score);
        confN++;
      }
    }
    stats.avg_confidence = confN > 0 ? Math.round((confSum / confN) * 1000) / 1000 : 0;
    stats.missing += Math.max(0, (ingredientCount ?? 0) - (prices?.length ?? 0));

    // Last CSV import — most recent history row sourced from csv_import
    const { data: lastCsvRows } = await supabaseAdmin
      .from("pe_price_history")
      .select("recorded_at, changed_by")
      .eq("source", "csv_import")
      .order("recorded_at", { ascending: false })
      .limit(1);
    const lastCsv = lastCsvRows?.[0] ?? null;

    let csvBatchCount = 0;
    if (lastCsv?.recorded_at) {
      // Count rows imported within ±2 minutes of the last import (approx batch)
      const ts = new Date(lastCsv.recorded_at).getTime();
      const start = new Date(ts - 120_000).toISOString();
      const end = new Date(ts + 120_000).toISOString();
      const { count } = await supabaseAdmin
        .from("pe_price_history")
        .select("*", { count: "exact", head: true })
        .eq("source", "csv_import")
        .gte("recorded_at", start)
        .lte("recorded_at", end);
      csvBatchCount = count ?? 0;
    }

    // Recent price changes — last 10 across all sources, joined with ingredient name
    const { data: recentRaw } = await supabaseAdmin
      .from("pe_price_history")
      .select(
        "id, ingredient_id, price_per_base_unit, currency, source, is_manual_override, recorded_at",
      )
      .order("recorded_at", { ascending: false })
      .limit(10);
    const ids = Array.from(new Set((recentRaw ?? []).map((r) => r.ingredient_id)));
    let nameMap = new Map<string, { name: string; base_unit: string }>();
    if (ids.length > 0) {
      const { data: ings } = await supabaseAdmin
        .from("pe_ingredients")
        .select("id, name, base_unit")
        .in("id", ids);
      nameMap = new Map((ings ?? []).map((i) => [i.id, { name: i.name, base_unit: i.base_unit }]));
    }
    const recent = (recentRaw ?? []).map((r) => ({
      ...r,
      ingredient_name: nameMap.get(r.ingredient_id)?.name ?? "(unknown)",
      base_unit: nameMap.get(r.ingredient_id)?.base_unit ?? "",
    }));

    return {
      stats,
      last_csv_import: lastCsv
        ? { recorded_at: lastCsv.recorded_at, batch_count: csvBatchCount }
        : null,
      recent_changes: recent,
    };
  });
