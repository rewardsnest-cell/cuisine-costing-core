import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy /inspired route. Renamed to /familiar-favorites. Kept as a permanent
 * redirect for backward compatibility and SEO continuity.
 */
export const Route = createFileRoute("/inspired")({
  loader: () => {
    throw redirect({ to: "/familiar-favorites" });
  },
  component: () => null,
});
