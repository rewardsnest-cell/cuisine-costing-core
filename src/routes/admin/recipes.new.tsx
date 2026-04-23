import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route: /admin/recipes/new
// All recipe creation now flows through /admin/recipe-hub with ?new=1.
export const Route = createFileRoute("/admin/recipes/new")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/recipe-hub", search: { new: 1 } });
  },
});
