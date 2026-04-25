// ARCHIVED — Pricing v1 price volatility (depended on price_history, now archived).
// See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";

export const getPriceVolatilityAlerts = createServerFn({ method: "GET" }).handler(
  async () => {
    return { alerts: [] as Array<never>, archived: true as const };
  },
);
