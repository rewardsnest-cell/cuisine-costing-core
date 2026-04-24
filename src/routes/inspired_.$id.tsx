import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /inspired/$id is a stable public URL for an Inspired recipe, but the actual
 * detail rendering lives at /recipes/$id (single source of truth). We redirect
 * server-side so links/SEO resolve cleanly.
 */
export const Route = createFileRoute("/inspired_/$id")({
  loader: ({ params }) => {
    throw redirect({ to: "/recipes/$id", params: { id: params.id } });
  },
  component: () => null,
});
