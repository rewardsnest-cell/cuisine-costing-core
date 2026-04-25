import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Nightly Kroger validation hook.
 *
 * Triggered by pg_cron once per night. Calls the SQL routine
 * `run_kroger_validation` which inspects:
 *   - ZIP codes used by quotes/leads with no cached locationId mapping
 *   - Outlier median calculations (>40% day-over-day change OR volatility > 0.35)
 *   - Failed Kroger ingest runs in the last 24h
 *
 * Anomalies are persisted to `kroger_validation_anomalies` and surfaced in
 * /admin/kroger-validation. Auth: Supabase publishable key bearer token.
 */
export const Route = createFileRoute("/api/public/hooks/kroger-validation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.replace(/^Bearer\s+/i, "");
        if (!token) {
          return new Response(JSON.stringify({ error: "Missing auth" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (
          token !== process.env.SUPABASE_PUBLISHABLE_KEY &&
          token !== process.env.VITE_SUPABASE_PUBLISHABLE_KEY
        ) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabaseAdmin.rpc("run_kroger_validation", {
          _triggered_by: "cron",
        });

        if (error) {
          console.error("kroger-validation cron failed:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        return Response.json({ ok: true, run_id: data });
      },
    },
  },
});
