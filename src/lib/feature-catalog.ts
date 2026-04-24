/**
 * Feature catalog — human-friendly metadata for every entry in
 * `public.feature_visibility`. Used by /admin/visibility to render labels,
 * descriptions, phase relevance, risk notes, and category groupings.
 *
 * Keys here MUST match feature_key values in the DB. Unknown keys still
 * render in the UI (under "Other") so a missing entry never blacks out a row.
 */

export type FeatureCategory =
  | "public_pages"
  | "admin_quotes"
  | "admin_pricing"
  | "admin_menu"
  | "admin_operations"
  | "admin_market"
  | "admin_governance"
  | "other";

/**
 * Lifecycle label admins use to reason about a feature, independent of the
 * raw `phase` field (which is more granular). Computed from phase + nav_enabled.
 */
export type FeatureStatus = "active" | "hidden" | "future" | "legacy";

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  active: "Active",
  hidden: "Hidden",
  future: "Future",
  legacy: "Legacy",
};

export const STATUS_BADGE_CLASS: Record<FeatureStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  hidden: "bg-muted text-muted-foreground",
  future: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  legacy: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export const STATUS_DESCRIPTION: Record<FeatureStatus, string> = {
  active: "Enabled and visible in its surface (nav or public).",
  hidden: "Route still exists but is intentionally hidden from nav.",
  future: "Planned for a later phase. Hidden until promoted.",
  legacy: "Deprecated. Kept for deep-link safety only.",
};

export type RiskLevel = "none" | "internal" | "pricing" | "destructive";

export const RISK_LABEL: Record<RiskLevel, string> = {
  none: "Safe",
  internal: "Internal",
  pricing: "Pricing-related",
  destructive: "Sensitive",
};

export const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  none: "bg-muted text-muted-foreground",
  internal: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  pricing: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  destructive: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  public_pages: "Public pages",
  admin_quotes: "Admin · Quotes",
  admin_pricing: "Admin · Pricing Intelligence",
  admin_menu: "Admin · Menu & Content",
  admin_operations: "Admin · Operations",
  admin_market: "Admin · Market Intelligence",
  admin_governance: "Admin · System & Governance",
  other: "Other",
};

export const CATEGORY_ORDER: FeatureCategory[] = [
  "public_pages",
  "admin_quotes",
  "admin_pricing",
  "admin_menu",
  "admin_operations",
  "admin_market",
  "admin_governance",
  "other",
];

export type FeatureMeta = {
  /** Display name shown in the visibility editor. */
  name: string;
  /** One-line description of what this feature does. */
  description: string;
  /** Which group it belongs to in the editor. */
  category: FeatureCategory;
  /** Phase relevance label (free text, e.g. "Phase 2", "Phase 3"). */
  phaseRelevance: string;
  /** Risk classification + plain-English risk note for admins. */
  risk: RiskLevel;
  riskNote?: string;
  /** True for keys controlling an admin-side surface (nav link visibility). */
  adminSurface?: boolean;
};

export const FEATURE_CATALOG: Record<string, FeatureMeta> = {
  // ─── Public pages ───────────────────────────────────────────────────────
  weddings: { name: "Weddings", description: "Public weddings landing page.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  catering: { name: "Catering", description: "Public catering landing page.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  menu: { name: "Public Menu", description: "Public-facing menu page.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  recipes: { name: "Recipes", description: "Public recipes index.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  guides: { name: "Cooking Guides", description: "Public cooking guides.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  cooking_lab: { name: "Cooking Lab", description: "Public cooking lab entries.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  blog: { name: "Blog", description: "Public blog feed.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  inspired: { name: "Inspired (legacy)", description: "Legacy alias for Familiar Favorites.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  familiar_favorites: { name: "Familiar Favorites", description: "Curated 'inspired by' menus.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  follow: { name: "Follow", description: "Newsletter / follow page.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  lookup: { name: "Quote Lookup", description: "Public quote lookup by reference.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  coupon: { name: "Coupons", description: "Coupon redemption page.", category: "public_pages", phaseRelevance: "Phase 2", risk: "none" },
  quote: { name: "Public Quote Intake", description: "Public-facing quote start flow. Phase 2 enforces no-pricing.", category: "public_pages", phaseRelevance: "Phase 2", risk: "pricing", riskNote: "Public-facing quote flow — pricing is intentionally suppressed in Phase 2. Do not change without reviewing the quote system." },

  // ─── Admin · Quotes ─────────────────────────────────────────────────────
  admin_quotes: { name: "Quotes Overview", description: "Admin list of saved quotes & detail view.", category: "admin_quotes", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_quote_lab: { name: "Quote Lab", description: "Internal quote testing surface — pricing toggleable.", category: "admin_quotes", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_concierge_review: { name: "AI Concierge Review", description: "Review queue for AI-generated quote suggestions.", category: "admin_quotes", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_quick_quote: { name: "Quick Quote (legacy)", description: "Older one-shot quote form. Replaced by Quote Lab.", category: "admin_quotes", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },

  // ─── Admin · Pricing Intelligence ───────────────────────────────────────
  admin_pricing_lab: { name: "Pricing Lab", description: "Internal pricing experiments & calibration.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — exposes admin UI only, not public pricing.", adminSurface: true },
  admin_pricing_lab_preview: { name: "Pricing Lab Preview", description: "Preview view for Pricing Lab outputs.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_pricing_test: { name: "Pricing Test Bench", description: "Controlled bench for pricing scenarios.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_margin_volatility: { name: "Margin & Volatility", description: "Margin and ingredient cost volatility analytics.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_national_prices: { name: "National Prices", description: "FRED-driven national price reference.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_trends: { name: "Price Trends", description: "Trend visualizations for ingredient prices.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_kroger_pricing: { name: "Kroger Pricing", description: "Kroger price feed & SKU mapping.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_kroger_sku_review: { name: "Kroger SKU Review", description: "Review queue for Kroger SKU matches.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_kroger_signals: { name: "Kroger Price Signals", description: "Anomaly & change signals from Kroger feed.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_cost_queue: { name: "Cost Update Queue", description: "Pending cost updates awaiting admin approval.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Pricing-related — admin UI only.", adminSurface: true },
  admin_pricing_visibility: { name: "Pricing Visibility", description: "Controls whether quote pricing is shown.", category: "admin_pricing", phaseRelevance: "Phase 3", risk: "pricing", riskNote: "Controls public pricing exposure — review carefully before enabling.", adminSurface: true },

  // ─── Admin · Menu & Content ─────────────────────────────────────────────
  admin_recipe_hub: { name: "Recipe Hub", description: "Central recipe management.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_public_menu: { name: "Public Menu Control", description: "Edit the public-facing menu.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_menu_modules: { name: "Menu Modules", description: "Reusable menu module library.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_menu_modules_preview: { name: "Menu Modules Preview", description: "Preview of menu module rendering.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_inspired_preview: { name: "Inspired Preview", description: "Preview Familiar Favorites layouts.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_cooking_guides: { name: "Cooking Guides", description: "Author public cooking guides.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_cooking_lab: { name: "Cooking Lab", description: "Manage Cooking Lab entries.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_newsletter_guide: { name: "Newsletter Guide", description: "Compose newsletter content.", category: "admin_menu", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_recipes: { name: "Recipes (legacy editor)", description: "Older recipes editor; superseded by Recipe Hub.", category: "admin_menu", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },

  // ─── Admin · Operations ─────────────────────────────────────────────────
  admin_events: { name: "Events", description: "Event scheduling & management.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_schedule: { name: "Schedule", description: "Staffing schedule.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_employees: { name: "Employees", description: "Employee profiles & roles.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_timesheets: { name: "Timesheets", description: "Time tracking & approvals.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_purchase_orders: { name: "Purchase Orders", description: "Vendor purchase orders.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_inventory: { name: "Inventory", description: "Inventory levels & adjustments.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_items: { name: "Items", description: "Item catalog & cost intelligence.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_suppliers: { name: "Suppliers", description: "Supplier directory.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_receipts: { name: "Receipts", description: "Receipts & costing review.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_users: { name: "Users", description: "User management.", category: "admin_operations", phaseRelevance: "Phase 2", risk: "destructive", riskNote: "Account changes affect login access. Sensitive.", adminSurface: true },

  // ─── Admin · Market Intelligence ────────────────────────────────────────
  admin_competitors: { name: "Competitors", description: "Competitor directory.", category: "admin_market", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_competitor_quotes: { name: "Competitor Quotes", description: "Captured competitor quotes for analysis.", category: "admin_market", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_competitor_trends: { name: "Competitor Trends", description: "Pricing trends across competitors.", category: "admin_market", phaseRelevance: "Phase 2", risk: "pricing", riskNote: "Includes competitor price data — internal only.", adminSurface: true },
  admin_sales_flyers: { name: "Sales & Flyers", description: "Sales flyers & promo capture.", category: "admin_market", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },

  // ─── Admin · System & Governance ────────────────────────────────────────
  admin_feature_visibility: { name: "Feature Visibility", description: "This page. Controls every feature flag.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "destructive", riskNote: "Disabling will lock you out of feature controls. Use with care.", adminSurface: true },
  admin_page_inventory: { name: "Page Inventory", description: "Inventory of every route in the app.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_audit_log: { name: "Audit Log", description: "Audit trail of admin actions.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_change_log: { name: "Change Log", description: "Published change log entries.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_project_intelligence: { name: "Project Intelligence", description: "Cross-cutting project diagnostics.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_access_control: { name: "Access Control", description: "Role assignments & invites.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "destructive", riskNote: "Grants/revokes admin access. Sensitive.", adminSurface: true },
  admin_integrations: { name: "Integrations", description: "External API integration status.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_brand_assets: { name: "Brand Assets", description: "Logos & imagery.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_brand_colors: { name: "Brand Colors", description: "Brand color tokens.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_brand_config: { name: "Brand Config", description: "Brand name & general config.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_affiliates: { name: "Affiliates", description: "Affiliate programs & earnings.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_feedback: { name: "Feedback", description: "User-submitted feedback inbox.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_review_inbox: { name: "Review Inbox", description: "Items pending admin review.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_uploads: { name: "Uploads Inbox", description: "Uploaded files awaiting processing.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },
  admin_exports: { name: "Exports & Reports", description: "Data exports & report generation.", category: "admin_governance", phaseRelevance: "Phase 2", risk: "internal", adminSurface: true },

  // Legacy admin tools (hidden by default)
  admin_import_recipes: { name: "Import Recipes (legacy)", description: "Legacy recipe importer.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_scan_flyer: { name: "Scan Flyer (legacy)", description: "Flyer scanning tool — now in header action.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_scan_assets: { name: "Scan Assets (legacy)", description: "Site asset scanner.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_generate_recipe_photos: { name: "Generate Recipe Photos (legacy)", description: "Bulk recipe photo generation.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_synonyms: { name: "Ingredient Synonyms (legacy)", description: "Manual synonym editor.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_auto_link_ingredients: { name: "Auto-link Ingredients (legacy)", description: "Bulk ingredient auto-linker.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_servings_review: { name: "Servings Review (legacy)", description: "Servings sanity checker.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_asset_debug: { name: "Asset Debug (legacy)", description: "Diagnostic tool for asset URLs.", category: "admin_governance", phaseRelevance: "Legacy", risk: "internal", adminSurface: true },
  admin_set_password: { name: "Set Password (legacy)", description: "Manual password reset helper.", category: "admin_governance", phaseRelevance: "Legacy", risk: "destructive", riskNote: "Account credentials — sensitive.", adminSurface: true },
};

export function getFeatureMeta(key: string): FeatureMeta {
  return (
    FEATURE_CATALOG[key] ?? {
      name: key,
      description: "No description registered for this key.",
      category: "other",
      phaseRelevance: "—",
      risk: "none",
    }
  );
}

/**
 * Compute a lifecycle status from the live row state.
 *
 * - active: phase=public AND nav_enabled
 * - hidden: phase in {public, soft_launch} but nav_enabled=false
 * - future: phase=admin_preview (planned for later)
 * - legacy: phase=off (deprecated; route kept for deep links)
 */
export function computeStatus(row: {
  phase: string;
  nav_enabled: boolean;
}): FeatureStatus {
  if (row.phase === "off") return "legacy";
  if (row.phase === "admin_preview") return "future";
  if ((row.phase === "public" || row.phase === "soft_launch") && !row.nav_enabled) return "hidden";
  return "active";
}
