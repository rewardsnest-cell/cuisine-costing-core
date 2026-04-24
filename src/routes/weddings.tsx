import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";

export const Route = createFileRoute("/weddings")({
  component: WeddingsLayout,
});

function WeddingsLayout() {
  return (
    <FeatureGate featureKey="weddings" label="Weddings">
      <Outlet />
    </FeatureGate>
  );
}
