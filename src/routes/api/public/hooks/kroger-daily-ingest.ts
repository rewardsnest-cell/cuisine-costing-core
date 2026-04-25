// ARCHIVED — Pricing v1 cron webhook. Returns 410 Gone.
// See /docs/pricing-archive.md.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/kroger-daily-ingest")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({
            archived: true,
            message: "kroger-daily-ingest is archived (Pricing v1).",
          }),
          { status: 410, headers: { "content-type": "application/json" } },
        ),
      GET: async () =>
        new Response("Gone — pricing v1 archived", { status: 410 }),
    },
  },
});
