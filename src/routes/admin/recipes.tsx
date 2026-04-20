import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/recipes")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/recipe-hub" });
  },
});
