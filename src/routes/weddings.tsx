import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/weddings")({
  component: WeddingsLayout,
});

function WeddingsLayout() {
  return <Outlet />;
}
