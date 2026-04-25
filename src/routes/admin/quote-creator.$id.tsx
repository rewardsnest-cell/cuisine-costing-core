import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/quote-creator/$id")({
  component: RedirectToHub,
});

function RedirectToHub() {
  const { id } = Route.useParams();
  return <Navigate to="/admin/quote-creator" search={{ event: id }} replace />;
}
