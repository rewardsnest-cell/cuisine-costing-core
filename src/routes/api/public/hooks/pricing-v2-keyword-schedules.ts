// Pricing v2 — Cron hook to run due keyword sweep schedules.
// Called periodically (e.g. hourly via pg_cron). Finds enabled schedules whose
// next_run_at <= now(), executes a keyword sweep for each, and reschedules.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  executeCatalogBootstrap,
  bootstrapSchema,
} from "@/lib/server-fns/pricing-v2-catalog.functions";

export const Route = createFileRoute("/api/public/hooks/pricing-v2-keyword-schedules")({
  server: {
    handlers: {
      POST: async () => {
        const nowIso = new Date().toISOString();

        // Pick due, enabled schedules.
        const { data: due, error } = await supabaseAdmin
          .from("pricing_v2_keyword_schedules")
          .select("*")
          .eq("enabled", true)
          .lte("next_run_at", nowIso)
          .order("next_run_at", { ascending: true })
          .limit(20);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (!due?.length) {
          return Response.json({ ok: true, ran: 0, message: "no schedules due" });
        }

        const results: any[] = [];

        // Helper to record an in-app notification (best-effort, never throws).
        async function notify(
          sched: any,
          event_type: "run_success" | "run_error" | "auto_disabled",
          severity: "info" | "warning" | "error" | "success",
          title: string,
          message: string | null,
          run_id: string | null,
          metadata: Record<string, any> = {},
        ) {
          try {
            await supabaseAdmin.from("pricing_v2_schedule_notifications").insert({
              schedule_id: sched.id,
              schedule_name: sched.name,
              event_type,
              severity,
              title,
              message,
              run_id,
              metadata,
            });
          } catch (e) {
            console.error("[schedule-notify] insert failed:", e);
          }
        }

        for (const sched of due) {
          let didRun = false;
          let autoDisableReason: string | null = null;
          let addedNewItems = false;
          let runOk = false;
          let runError: string | null = null;
          let runId: string | null = null;
          let countsOut = 0;

          // Check expiry / cap before running.
          if (sched.expires_at && new Date(sched.expires_at).getTime() <= Date.now()) {
            autoDisableReason = "expired";
            results.push({ schedule_id: sched.id, skipped: true, reason: "expired" });
          } else if (sched.max_runs && (sched.run_count ?? 0) >= sched.max_runs) {
            autoDisableReason = "max_runs_reached";
            results.push({ schedule_id: sched.id, skipped: true, reason: "max_runs_reached" });
          } else {
            try {
              // Continuous mode always sweeps all enabled keywords.
              const sweepAll = sched.continuous_mode || sched.use_all_keywords;
              let kwQuery = supabaseAdmin
                .from("pricing_v2_keyword_library")
                .select("keyword, enabled")
                .eq("enabled", true);
              if (!sweepAll) {
                kwQuery = kwQuery.in("id", sched.keyword_ids ?? []);
              }
              const { data: kwRows } = await kwQuery;
              const terms = (kwRows ?? []).map((r: any) => String(r.keyword));
              if (!terms.length) {
                results.push({ schedule_id: sched.id, skipped: true, reason: "no enabled keywords" });
              } else {
                // Snapshot catalog size to detect "no new items" for continuous mode.
                let beforeCount = 0;
                if (sched.continuous_mode && sched.stop_when_no_new_items) {
                  const { count } = await supabaseAdmin
                    .from("pricing_v2_item_catalog")
                    .select("*", { count: "exact", head: true });
                  beforeCount = count ?? 0;
                }

                const input = bootstrapSchema.parse({
                  dry_run: false,
                  keywords: terms,
                  keyword_limit: sched.keyword_limit ?? 250,
                  skip_weight_normalization: sched.skip_weight_normalization ?? true,
                  batch_size: 1,
                  bypass_min_mapped_check: true,
                  schedule_id: sched.id,
                });
                const res = await executeCatalogBootstrap(supabaseAdmin, null, input, {
                  triggered_by: "schedule",
                });
                didRun = true;
                runOk = true;
                runId = (res as any).run_id ?? null;
                countsOut = (res as any).counts_out ?? 0;

                if (sched.continuous_mode && sched.stop_when_no_new_items) {
                  const { count } = await supabaseAdmin
                    .from("pricing_v2_item_catalog")
                    .select("*", { count: "exact", head: true });
                  const afterCount = count ?? 0;
                  addedNewItems = afterCount > beforeCount;
                }

                results.push({
                  schedule_id: sched.id,
                  run_id: runId,
                  counts_in: (res as any).counts_in ?? 0,
                  counts_out: countsOut,
                  continuous: !!sched.continuous_mode,
                  added_new_items: addedNewItems,
                });
              }
            } catch (e: any) {
              runError = e?.message ?? String(e);
              results.push({ schedule_id: sched.id, error: runError });
            }
          }

          // Compute next_run_at: continuous = short interval; otherwise cadence_hours.
          const intervalMs = sched.continuous_mode
            ? Math.max(10, sched.continuous_interval_seconds ?? 60) * 1000
            : (sched.cadence_hours ?? 24) * 3600_000;
          const next = new Date(Date.now() + intervalMs).toISOString();
          const update: Record<string, any> = { next_run_at: next };
          if (didRun) update.run_count = (sched.run_count ?? 0) + 1;

          // Continuous: track consecutive empty runs and auto-stop when threshold reached.
          if (didRun && sched.continuous_mode && sched.stop_when_no_new_items) {
            const nextEmpty = addedNewItems ? 0 : (sched.consecutive_empty_runs ?? 0) + 1;
            update.consecutive_empty_runs = nextEmpty;
            if (nextEmpty >= (sched.empty_runs_threshold ?? 2)) {
              update.enabled = false;
              autoDisableReason = autoDisableReason ?? "catalog_complete";
            }
          }

          if (autoDisableReason && update.enabled !== false) {
            update.enabled = false;
          } else if (didRun && sched.max_runs && (sched.run_count ?? 0) + 1 >= sched.max_runs) {
            update.enabled = false;
            autoDisableReason = autoDisableReason ?? "max_runs_reached";
          } else if (
            didRun &&
            sched.expires_at &&
            new Date(sched.expires_at).getTime() <= Date.now() + intervalMs
          ) {
            update.enabled = false;
            autoDisableReason = autoDisableReason ?? "expiring_before_next_run";
          }

          await supabaseAdmin
            .from("pricing_v2_keyword_schedules")
            .update(update as any)
            .eq("id", sched.id);

          // ---------- Notifications ----------
          if (runOk) {
            await notify(
              sched,
              "run_success",
              "success",
              `Sweep finished: ${sched.name}`,
              `Fetched ${countsOut} item${countsOut === 1 ? "" : "s"}${
                sched.continuous_mode ? (addedNewItems ? " (new items added)" : " (no new items)") : ""
              }.`,
              runId,
              { counts_out: countsOut, added_new_items: addedNewItems, continuous: !!sched.continuous_mode },
            );
          }
          if (runError) {
            await notify(
              sched,
              "run_error",
              "error",
              `Sweep failed: ${sched.name}`,
              runError.slice(0, 500),
              null,
              { error: runError },
            );
          }
          if (autoDisableReason) {
            const reasonText: Record<string, string> = {
              expired: "Schedule reached its end date.",
              max_runs_reached: "Schedule hit its maximum run count.",
              catalog_complete: "Continuous sweep stopped: catalog appears complete (no new items in recent runs).",
              expiring_before_next_run: "Next scheduled run would land after the end date.",
            };
            await notify(
              sched,
              "auto_disabled",
              autoDisableReason === "catalog_complete" ? "success" : "warning",
              `Schedule auto-disabled: ${sched.name}`,
              reasonText[autoDisableReason] ?? `Reason: ${autoDisableReason}`,
              runId,
              { reason: autoDisableReason, run_count: (sched.run_count ?? 0) + (didRun ? 1 : 0) },
            );
          }
        }

        return Response.json({ ok: true, ran: results.length, results });
      },
      GET: async () =>
        new Response("ok — POST to trigger due schedules", { status: 200 }),
    },
  },
});
