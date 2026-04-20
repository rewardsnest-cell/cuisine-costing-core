import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/pricing/national")({
  beforeLoad: () => {
    throw redirect({
      to: "/admin/national-prices",
      search: { tab: "snapshots" },
      replace: true,
    });
  },
});
