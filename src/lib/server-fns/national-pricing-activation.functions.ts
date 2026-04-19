import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const COVERAGE_THRESHOLD = 0.85;

async function assertAdmin(sb: any) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: roleRow } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) throw new Error("Admin access required");
  return user;
}

/**
 * Get status header data: active month, staged month, coverage, source, status.
 */
export const getNationalPricingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { stagedMonth?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: kv } = await sb
      .from("app_kv")
      .select("value")
      .eq("key", "active_national_price_month")
      .maybeSingle();
    const activeMonth = (kv?.value as string | null) || null;

    // Determine staged month: explicit, or latest in staging
    let stagedMonth = data.stagedMonth || null;
    if (!stagedMonth) {
      const { data: latest } = await sb
        .from("national_price_staging")
        .select("month")
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();
      stagedMonth = (latest?.month as string | null) || null;
    }

    const { count: totalIngredients } = await sb
      .from("ingredient_reference")
      .select("id", { count: "exact", head: true });

    let coveredIngredients = 0;
    let source: string | null = null;
    if (stagedMonth) {
      const { data: stagedRows } = await sb
        .from("national_price_staging")
        .select("ingredient_id, source")
        .eq("month", stagedMonth);
      const ids = new Set<string>();
      for (const r of stagedRows ?? []) {
        ids.add((r as any).ingredient_id);
        if (!source) source = (r as any).source;
      }
      coveredIngredients = ids.size;
    }

    const total = Number(totalIngredients) || 0;
    const coverage = total > 0 ? coveredIngredients / total : 0;
    const ready = !!stagedMonth && coverage >= COVERAGE_THRESHOLD;

    return {
      activeMonth,
      stagedMonth,
      coverage,
      coveragePct: Math.round(coverage * 1000) / 10,
      coveredIngredients,
      totalIngredients: total,
      source,
      status: ready ? "Ready" : "Incomplete",
      threshold: COVERAGE_THRESHOLD,
    };
  });

/**
 * Returns staged rows + missing ingredients for a given month.
 */
export const getNationalPricingPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { month: string }) => {
    if (!data?.month || !MONTH_RE.test(data.month)) throw new Error("month YYYY-MM required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: staged } = await sb
      .from("national_price_staging")
      .select("ingredient_id, price, unit, region, source, fetched_at")
      .eq("month", data.month)
      .order("fetched_at", { ascending: false });

    const stagedIds = new Set<string>((staged ?? []).map((r: any) => r.ingredient_id));

    const { data: refs } = await sb
      .from("ingredient_reference")
      .select("id, canonical_name, default_unit")
      .order("canonical_name");

    const refMap = new Map<string, { name: string; unit: string }>();
    for (const r of refs ?? []) {
      refMap.set((r as any).id, {
        name: (r as any).canonical_name,
        unit: (r as any).default_unit,
      });
    }

    const rows = (staged ?? []).map((r: any) => ({
      ingredient_id: r.ingredient_id,
      ingredient_name: refMap.get(r.ingredient_id)?.name || r.ingredient_id,
      price: Number(r.price),
      unit: r.unit,
      region: r.region,
      source: r.source,
      fetched_at: r.fetched_at,
    }));

    const missing = (refs ?? [])
      .filter((r: any) => !stagedIds.has(r.id))
      .map((r: any) => ({ id: r.id, name: r.canonical_name }));

    return { rows, missing, total: refs?.length ?? 0, covered: stagedIds.size };
  });

/**
 * Insert/replace a staging row (admin preview workflow).
 * Overwrites allowed in staging — never touches snapshots.
 */
export const upsertStagingRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: unknown[] }) => {
    if (!data || !Array.isArray(data.rows) || data.rows.length === 0)
      throw new Error("rows required");
    if (data.rows.length > 5000) throw new Error("too many rows (max 5000)");
    const rows = data.rows.map((r: any, i) => {
      const where = `row ${i + 1}`;
      if (!r?.ingredient_id) throw new Error(`${where}: ingredient_id required`);
      const price = Number(r.price);
      if (!Number.isFinite(price) || price < 0) throw new Error(`${where}: price must be >= 0`);
      if (!r.unit) throw new Error(`${where}: unit required`);
      if (!r.month || !MONTH_RE.test(r.month)) throw new Error(`${where}: month YYYY-MM required`);
      if (!r.source) throw new Error(`${where}: source required`);
      return {
        ingredient_id: String(r.ingredient_id),
        price,
        unit: String(r.unit),
        region: r.region ? String(r.region) : null,
        month: String(r.month),
        source: String(r.source),
      };
    });
    return { rows };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdmin(sb);

    let upserted = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const { error } = await sb
        .from("national_price_staging")
        .upsert(
          { ...r, fetched_at: new Date().toISOString() },
          { onConflict: "ingredient_id,region,month,source" },
        );
      if (error) errors.push({ row: i + 1, message: error.message });
      else upserted += 1;
    }
    return { upserted, errors, total: data.rows.length };
  });

/**
 * Activate a staged month: copy staging → snapshots, set active month.
 * Append-only. Skips snapshot rows that already exist (per unique constraint).
 * One activation per month enforced by snapshot unique constraint.
 */
export const activateNationalPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { month: string }) => {
    if (!data?.month || !MONTH_RE.test(data.month)) throw new Error("month YYYY-MM required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAdmin(sb);

    // Feature gate
    const { data: flagRow } = await sb
      .from("app_kv")
      .select("value")
      .eq("key", "national_pricing_enabled")
      .maybeSingle();
    const flagEnabled = String(flagRow?.value ?? "").toLowerCase() === "true";
    if (!flagEnabled) {
      throw new Error(
        "National pricing is disabled. Enable the 'national_pricing_enabled' feature flag before activating a month.",
      );
    }


    const { count: totalIngredients } = await sb
      .from("ingredient_reference")
      .select("id", { count: "exact", head: true });

    const { data: stagedRows } = await sb
      .from("national_price_staging")
      .select("ingredient_id, price, unit, region, source")
      .eq("month", data.month);

    const uniqueIds = new Set<string>((stagedRows ?? []).map((r: any) => r.ingredient_id));
    const total = Number(totalIngredients) || 0;
    const coverage = total > 0 ? uniqueIds.size / total : 0;
    if (coverage < COVERAGE_THRESHOLD) {
      throw new Error(
        `Coverage ${Math.round(coverage * 1000) / 10}% below required ${Math.round(
          COVERAGE_THRESHOLD * 100,
        )}%`,
      );
    }

    let inserted = 0;
    let skipped = 0;
    for (const r of stagedRows ?? []) {
      const { error } = await sb.from("national_price_snapshots").insert({
        ingredient_id: (r as any).ingredient_id,
        price: (r as any).price,
        unit: (r as any).unit,
        region: (r as any).region,
        month: data.month,
        source: (r as any).source,
      });
      if (error) {
        if (error.code === "23505") skipped += 1;
        else throw new Error(`Snapshot insert failed: ${error.message}`);
      } else {
        inserted += 1;
      }
    }

    const { error: kvErr } = await sb
      .from("app_kv")
      .upsert(
        { key: "active_national_price_month", value: data.month, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (kvErr) throw new Error(`Failed to set active month: ${kvErr.message}`);

    return { inserted, skipped, month: data.month };
  });
