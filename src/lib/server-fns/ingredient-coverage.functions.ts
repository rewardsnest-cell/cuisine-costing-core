// ARCHIVED — Pricing v1 ingredient coverage (depended on national_price_snapshots).
// See /docs/pricing-archive.md.
import { createServerFn } from "@tanstack/react-start";

const empty = async () => ({
  total: 0,
  covered: 0,
  uncovered: 0,
  coverage_pct: 0,
  archived: true as const,
});

export const getGlobalIngredientCoverage = createServerFn({ method: "GET" }).handler(empty);
export const getQuoteIngredientCoverage = createServerFn({ method: "POST" }).handler(empty);
export const getNationalPriceCoverage = createServerFn({ method: "GET" }).handler(empty);
