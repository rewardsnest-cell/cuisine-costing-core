import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { KROGER_HARDCODED_ZIP } from "@/lib/server/kroger-core";

/**
 * Clean-slate pricing admin server functions powering /admin/pricing.
 *
 * - Reads/writes the global markup multiplier (app_settings.markup_multiplier).
 * - Returns last-run + counts so the UI can show pipeline health at a glance.
 * - Provides a destructive `resetPricingPipeline` that wipes Kroger tables
 *   and zeros inventory costs so we can rebuild from scratch.
 * - Triggers ingest runs by delegating to runKrogerIngestInternal.
 */

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getPricingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("markup_multiplier")
      .eq("id", 1)
      .maybeSingle();

    const { count: skuCount } = await supabaseAdmin
      .from("kroger_sku_map")
      .select("*", { count: "exact", head: true });

    const { count: priceRows } = await supabaseAdmin
      .from("price_history")
      .select("*", { count: "exact", head: true })
      .eq("source", "kroger");

    const { count: inventoryCount } = await supabaseAdmin
      .from("inventory_items")
      .select("*", { count: "exact", head: true });

    const { count: inventoryWithCost } = await supabaseAdmin
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .gt("average_cost_per_unit", 0);

    const { data: lastRun } = await supabaseAdmin
      .from("kroger_ingest_runs")
      .select("id,status,started_at,finished_at,items_queried,price_rows_written,sku_map_rows_touched,message,location_id,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasKeys =
      !!process.env.KROGER_CLIENT_ID && !!process.env.KROGER_CLIENT_SECRET;

    return {
      markup_multiplier: Number(settings?.markup_multiplier ?? 3),
      kroger_zip: KROGER_HARDCODED_ZIP,
      keys_configured: hasKeys,
      sku_count: skuCount ?? 0,
      kroger_price_rows: priceRows ?? 0,
      inventory_count: inventoryCount ?? 0,
      inventory_with_cost: inventoryWithCost ?? 0,
      last_run: lastRun ?? null,
    };
  });

export const updateMarkupMultiplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: number }) => {
    if (typeof d?.value !== "number" || !Number.isFinite(d.value)) {
      throw new Error("value must be a number");
    }
    if (d.value < 0.5 || d.value > 10) {
      throw new Error("Markup must be between 0.5 and 10");
    }
    return d;
  })
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { id: 1, markup_multiplier: data.value, updated_at: new Date().toISOString() } as any,
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("access_audit_log").insert({
      action: "markup_multiplier_update",
      actor_user_id: context.userId,
      details: { value: data.value },
    });
    return { ok: true, value: data.value };
  });

export const runPricingIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode: "catalog_bootstrap" | "daily_update"; limit?: number }) => {
    if (d.mode !== "catalog_bootstrap" && d.mode !== "daily_update") {
      throw new Error("invalid mode");
    }
    return d;
  })
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET) {
      return { ran: false, reason: "missing_keys", message: "Kroger API keys not configured." } as const;
    }
    const { runKrogerIngestInternal } = await import("@/lib/server/kroger-ingest-internal");
    const result = await runKrogerIngestInternal({ mode: data.mode, limit: data.limit });
    return {
      ran: result.status !== "failed" && result.status !== "skipped",
      run_id: result.run_id,
      status: result.status,
      location_id: result.location_id,
      message: result.message ?? null,
    } as const;
  });

/**
 * DESTRUCTIVE: wipes the Kroger ingest pipeline and zeros inventory costs.
 * Caller must pass `confirm: "RESET"`.
 */
export const resetPricingPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: string }) => {
    if (d?.confirm !== "RESET") throw new Error("Confirmation token required");
    return d;
  })
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);

    const counts: Record<string, number> = {};

    // Order matters: clear children before parents where there are FKs.
    const wipes: Array<[string, () => Promise<{ count: number | null }>]> = [
      ["kroger_bootstrap_progress", () =>
        supabaseAdmin.from("kroger_bootstrap_progress").delete().not("run_id", "is", null).then((r) => ({ count: r.count })),
      ],
      ["kroger_validation_anomalies", () =>
        supabaseAdmin.from("kroger_validation_anomalies").delete().not("id", "is", null).then((r) => ({ count: r.count })),
      ],
      ["kroger_validation_runs", () =>
        supabaseAdmin.from("kroger_validation_runs").delete().not("id", "is", null).then((r) => ({ count: r.count })),
      ],
      ["price_history_kroger", () =>
        supabaseAdmin.from("price_history").delete().in("source", ["kroger", "kroger_api"]).then((r) => ({ count: r.count })),
      ],
      ["kroger_sku_map", () =>
        supabaseAdmin.from("kroger_sku_map").delete().not("id", "is", null).then((r) => ({ count: r.count })),
      ],
      ["kroger_ingest_runs", () =>
        supabaseAdmin.from("kroger_ingest_runs").delete().not("id", "is", null).then((r) => ({ count: r.count })),
      ],
    ];

    for (const [name, fn] of wipes) {
      try {
        const { count } = await fn();
        counts[name] = count ?? 0;
      } catch (e: any) {
        counts[name] = -1;
      }
    }

    // Zero inventory cost so prices come only from fresh Kroger pulls.
    const { count: invCount, error: invErr } = await supabaseAdmin
      .from("inventory_items")
      .update({
        average_cost_per_unit: 0,
        last_receipt_cost: 0,
        updated_at: new Date().toISOString(),
      } as any, { count: "exact" })
      .not("id", "is", null);
    counts["inventory_items_zeroed"] = invErr ? -1 : invCount ?? 0;

    await supabaseAdmin.from("access_audit_log").insert({
      action: "pricing_pipeline_reset",
      actor_user_id: context.userId,
      details: counts,
    });

    return { ok: true, counts };
  });
