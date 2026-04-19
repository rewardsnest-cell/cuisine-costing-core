import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { generateFlippImage, createFlippLink } from "@/lib/server-fns/flipp.functions";

/**
 * Public REST wrapper around the Flipp server functions.
 * Useful for external tooling, webhooks, or curl-based testing.
 *
 * POST /api/flipp?action=image  -> { template_id, values, target? }
 * POST /api/flipp?action=link   -> { template_id?, values, destination_url, target?, campaign? }
 */

const valueSchema = z.object({
  name: z.string().min(1).max(120),
  value: z.string().nullable(),
});

const targetSchema = z
  .object({
    kind: z.enum(["recipe", "sale_flyer", "sale_flyer_item", "none"]),
    id: z.string().uuid().optional(),
    column: z.string().max(64).optional(),
  })
  .optional();

const imageBody = z.object({
  template_id: z.string().min(1).max(200),
  values: z.array(valueSchema).max(50),
  target: targetSchema,
});

const linkBody = z.object({
  template_id: z.string().min(1).max(200).optional(),
  values: z.array(valueSchema).max(50),
  destination_url: z.string().url().max(2048),
  target: targetSchema,
  campaign: z.string().min(1).max(120).optional(),
});

export const Route = createFileRoute("/api/flipp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const action = (url.searchParams.get("action") || "link").toLowerCase();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        try {
          if (action === "image") {
            const parsed = imageBody.parse(body);
            const out = await generateFlippImage({ data: parsed as any });
            return Response.json({ ok: true, ...out });
          }
          if (action === "link") {
            const parsed = linkBody.parse(body);
            const out = await createFlippLink({ data: parsed as any });
            return Response.json({ ok: true, ...out });
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (err: any) {
          if (err?.issues) {
            return Response.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
          }
          console.error("[api/flipp] failed:", err?.message);
          return Response.json({ error: err?.message || "Flipp request failed" }, { status: 502 });
        }
      },
    },
  },
});
