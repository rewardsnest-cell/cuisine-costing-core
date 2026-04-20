import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/recipes/$id/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/recipe-hub/$id",
      params: { id: params.id },
      search: { tab: "recipe" },
    });
  },
});
