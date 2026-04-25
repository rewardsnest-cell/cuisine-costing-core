// Read-only catalogue of pricing-related code in the repository.
// Surfaced via /admin/pricing-code-inventory so admins can review what exists
// before refactoring or extending the pricing/cost system.

export const PRICING_INVENTORY_GENERATED_AT = "2026-04-25";

export type InventoryRecommendation =
  | "KEEP"
  | "CENTRALIZE"
  | "EXPOSE"
  | "LEGACY";

export type InventoryEntry = {
  path: string;
  layer: string;
  purpose: string;
  notes: string;
  recommendation: InventoryRecommendation;
};

export const PRICING_INVENTORY: InventoryEntry[] = [
  {
    path: "src/lib/recipe-costing.ts",
    layer: "Cost normalization & units",
    purpose: "Unit math, weight conversions (WEIGHT_TO_LB), recipe cost rollup.",
    notes: "Lacks density bridging (weight ↔ volume). Good candidate to centralize.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "src/lib/server/kroger-core.ts",
    layer: "Cost ingestion (Kroger)",
    purpose: "OAuth, ZIP/Location resolution, normalizeKrogerPrice().",
    notes: "Single source of truth for Kroger price normalization.",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/kroger-ingest-internal.functions.ts",
    layer: "Cost ingestion (Kroger)",
    purpose: "Signal-only Kroger ingest; routes through cost_update_queue.",
    notes: "Does not mutate inventory directly. Audit-friendly.",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/kroger-pricing.functions.ts",
    layer: "Cost ingestion (Kroger)",
    purpose: "Kroger pricing lookups for admin tools.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/update-inventory-costs.functions.ts",
    layer: "Cost ingestion (Receipts)",
    purpose: "Updates inventory_items.average_cost_per_unit from receipts.",
    notes: "Averaging logic differs slightly from apply_po_to_inventory SQL.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "supabase: apply_po_to_inventory()",
    layer: "Cost ingestion (Purchase Orders)",
    purpose: "Mutates average_cost_per_unit when POs are applied.",
    notes: "Should converge with receipts averaging into one helper.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "src/lib/server-fns/fred-pricing.functions.ts",
    layer: "National baselines",
    purpose: "Pulls FRED national price feeds; recomputes recipe costs on update.",
    notes: "Trusted national reference data for floor/margin checks.",
    recommendation: "KEEP",
  },
  {
    path: "src/lib/server-fns/recalc-quote-pricing.functions.ts",
    layer: "Quote application",
    purpose: "Applies global markup_multiplier from app_settings to quotes.",
    notes: "Discrepancy: SQL honors per-recipe markup_percentage. Reconcile.",
    recommendation: "CENTRALIZE",
  },
  {
    path: "src/lib/server-fns/apply-national-floor.functions.ts",
    layer: "Quote application",
    purpose: "Margin-safe re-pricing using national snapshot vs local average.",
    notes: "Good guardrail logic — expose to Item Cost Matrix.",
    recommendation: "EXPOSE",
  },
  {
    path: "src/lib/server-fns/cost-intelligence.functions.ts",
    layer: "Guardrails & audit",
    purpose: "Primary API for cost_update_queue (propose/approve/reject/override).",
    notes: "Mutation hub. All significant cost shifts flow through here.",
    recommendation: "KEEP",
  },
  {
    path: "supabase: trg_recipe_sync_pricing_columns",
    layer: "Guardrails & audit",
    purpose: "Trigger keeps recipe price columns in sync after cost changes.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/routes/admin/pricing-lab.preview.tsx",
    layer: "Admin UI",
    purpose: "Older preview of Pricing Lab.",
    notes: "Appears redundant vs pricing-lab.tsx.",
    recommendation: "LEGACY",
  },
  {
    path: "src/routes/admin/pricing.national.tsx",
    layer: "Admin UI",
    purpose: "Older national-pricing view.",
    notes: "Superseded by national-prices.tsx.",
    recommendation: "LEGACY",
  },
  {
    path: "src/routes/admin/national-prices.tsx",
    layer: "Admin UI",
    purpose: "Current national prices admin view.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/routes/admin/kroger-pricing.tsx",
    layer: "Admin UI",
    purpose: "Kroger pricing dashboard.",
    notes: "",
    recommendation: "KEEP",
  },
  {
    path: "src/routes/admin/cost-queue.tsx",
    layer: "Admin UI",
    purpose: "Cost Update Queue UI consuming cost-intelligence.functions.ts.",
    notes: "",
    recommendation: "KEEP",
  },
];

export const SQL_PRICING_REFERENCES: { name: string; purpose: string }[] = [
  { name: "apply_po_to_inventory", purpose: "Applies PO lines to average_cost_per_unit." },
  { name: "trg_recipe_sync_pricing_columns", purpose: "Keeps recipe pricing columns aligned with cost changes." },
  { name: "cost_update_queue (table)", purpose: "Audit-friendly queue for proposed cost mutations." },
  { name: "access_audit_log (table)", purpose: "Records significant cost shifts (>5%) and overrides." },
];

export function summarizeInventory(entries: InventoryEntry[] = PRICING_INVENTORY) {
  const byRecommendation: Record<InventoryRecommendation, number> = {
    KEEP: 0,
    CENTRALIZE: 0,
    EXPOSE: 0,
    LEGACY: 0,
  };
  for (const e of entries) byRecommendation[e.recommendation]++;
  return { total: entries.length, byRecommendation };
}
