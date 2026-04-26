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
        for (const sched of due) {
          try {
            // Resolve enabled keyword strings for this schedule.
            const { data: kwRows } = await supabaseAdmin
              .from("pricing_v2_keyword_library")
              .select("keyword, enabled")
              .in("id", sched.keyword_ids ?? []);
            const terms = (kwRows ?? [])
              .filter((r: any) => r.enabled)
              .map((r: any) => String(r.keyword));
            if (!terms.length) {
              results.push({ schedule_id: sched.id, skipped: true, reason: "no enabled keywords" });
            } else {
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
              results.push({
                schedule_id: sched.id,
                run_id: (res as any).run_id ?? null,
                counts_in: (res as any).counts_in ?? 0,
                counts_out: (res as any).counts_out ?? 0,
              });
            }
          } catch (e: any) {
            results.push({ schedule_id: sched.id, error: e?.message ?? String(e) });
          } finally {
            // Reschedule regardless of outcome to avoid hot-looping a broken schedule.
            const next = new Date(Date.now() + (sched.cadence_hours ?? 24) * 3600_000).toISOString();
            await supabaseAdmin
              .from("pricing_v2_keyword_schedules")
              .update({ next_run_at: next })
              .eq("id", sched.id);
          }
        }

        return Response.json({ ok: true, ran: results.length, results });
      },
      GET: async () =>
        new Response("ok — POST to trigger due schedules", { status: 200 }),
    },
  },
});
