import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy /inspired/$id route. The detail page lives at /recipes/$id; we
 * redirect there directly to preserve SEO continuity.
 */
export const Route = createFileRoute("/inspired_/$id")({
  loader: ({ params }) => {
    throw redirect({ to: "/recipes/$id", params: { id: params.id } });
  },
  component: () => null,
});
