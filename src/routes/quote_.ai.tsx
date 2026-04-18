import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/quote_/ai")({
  beforeLoad: () => {
    throw redirect({ to: "/catering/quote", statusCode: 301 });
  },
  component: () => null,
});
