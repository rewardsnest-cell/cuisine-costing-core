import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Daily Kroger ingest hook.
 *
 * Triggered by pg_cron once per day. Enqueues a run row and kicks off the
 * background worker by importing performIngest dynamically so the heavy
 * server-fn module isn't pulled into the route bundle until the hook fires.
 *
 * Requires Bearer auth header matching the Supabase publishable key.
 * Aborts if the feature flag is disabled or required keys are missing —
 * those conditions are logged into kroger_ingest_runs as `skipped`.
 */
export const Route = createFileRoute("/api/public/hooks/kroger-daily-ingest")({
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

        // Reject calls without a valid Supabase publishable key
        if (token !== process.env.SUPABASE_PUBLISHABLE_KEY && token !== process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: { mode?: "catalog_bootstrap" | "daily_update"; zip_code?: string; limit?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* empty body is fine */
        }

        const mode = body.mode === "catalog_bootstrap" ? "catalog_bootstrap" : "daily_update";

        // Feature gate
        const { data: kv } = await supabaseAdmin
          .from("app_kv")
          .select("value")
          .eq("key", "enable_kroger_ingest")
          .maybeSingle();
        const enabled = String((kv as any)?.value ?? "false").toLowerCase() === "true";
        if (!enabled) {
          await supabaseAdmin.from("kroger_ingest_runs").insert({
            status: "skipped",
            finished_at: new Date().toISOString(),
            message: `Cron skipped: feature disabled (mode=${mode})`,
          });
          return Response.json({ ran: false, reason: "feature_disabled" });
        }
        if (!process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET) {
          await supabaseAdmin.from("kroger_ingest_runs").insert({
            status: "skipped",
            finished_at: new Date().toISOString(),
            message: `Cron skipped: missing API keys (mode=${mode})`,
          });
          return Response.json({ ran: false, reason: "missing_keys" });
        }

        // Lazy import to keep the route bundle small.
        const { runKrogerIngestInternal } = await import("@/lib/server/kroger-ingest-internal");
        const result = await runKrogerIngestInternal({
          mode,
          zip_code: body.zip_code,
          limit: body.limit,
        });

        return Response.json({ ok: true, ...result });
      },
    },
  },
});
