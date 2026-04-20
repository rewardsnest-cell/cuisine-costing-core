/**
 * Central registry of help copy for every admin page.
 * Keep wording short, calm, and action-oriented — this is shown above every page.
 */
export type PageHelp = {
  title: string;
  purpose: string;
  whenToUse?: string;
  related?: { label: string; to: string }[];
};

const REGISTRY: Record<string, PageHelp> = {
  // ───────── Overview ─────────
  "/admin": {
    title: "Admin Dashboard",
    purpose: "Your daily snapshot of pricing health, recent quotes, low stock, and outstanding tasks.",
    whenToUse: "First stop each morning to spot anything that needs attention before the day starts.",
  },

  // ───────── Pricing Intelligence ─────────
  "/admin/national-prices": {
    title: "Pricing Intelligence",
    purpose: "Manage USDA/FRED data sources, monthly snapshots, and the safety floor that protects quote margins when local prices dip.",
    whenToUse: "Once a month after the FRED cron runs — review pulls, activate the new month, fill any gaps.",
    related: [
      { label: "Margin & Volatility", to: "/admin/margin-volatility" },
      { label: "Price Trends", to: "/admin/trends" },
    ],
  },
  "/admin/margin-volatility": {
    title: "Margin & Volatility",
    purpose: "Track quote margins over time and spot ingredients whose prices swing enough to threaten profitability.",
    whenToUse: "Weekly review, or whenever a quote feels surprisingly tight.",
    related: [{ label: "National Prices", to: "/admin/national-prices" }],
  },
  "/admin/trends": {
    title: "Price Trends",
    purpose: "Charts of historical ingredient prices from receipts, FRED, and competitor flyers — see what's moving.",
    whenToUse: "Before a big quote, or when planning seasonal menus.",
  },
  "/admin/competitor-trends": {
    title: "Competitor Trends",
    purpose: "Aggregate per-guest pricing across competitors over time, by event type and service style.",
    whenToUse: "Quarterly pricing review or when you suspect a competitor moved their rates.",
    related: [{ label: "Competitor Quotes", to: "/admin/competitor-quotes" }],
  },
  "/admin/competitor-quotes": {
    title: "Competitor Quotes",
    purpose: "Library of competitor quotes you've scanned — extracted line items, totals, and outcomes.",
    whenToUse: "When a client shares a competing bid, or to study how others price specific menus.",
    related: [{ label: "Competitors", to: "/admin/competitors" }],
  },
  "/admin/competitors": {
    title: "Competitors",
    purpose: "Directory of catering competitors you track — used to attribute scanned quotes and trend data.",
  },
  "/admin/quick-quote": {
    title: "Quick Quote",
    purpose: "Build a quote in seconds with smart defaults — guest count, recipes, automatic costing, instant PDF.",
    whenToUse: "Phone inquiries and walk-ins where you need a number fast.",
    related: [{ label: "Saved Quotes", to: "/admin/quotes" }],
  },
  "/admin/quotes": {
    title: "Saved Quotes",
    purpose: "Every quote you've created — filter by status, client, or date. Convert won quotes into events.",
    related: [{ label: "Quick Quote", to: "/admin/quick-quote" }],
  },

  // ───────── Recipes & Menu ─────────
  "/admin/recipe-hub": {
    title: "Recipe Hub",
    purpose: "Single source of truth for every recipe — costs, servings, ingredients, photos, status.",
    whenToUse: "Daily — adding new recipes, fixing costing, updating photos.",
    related: [
      { label: "Public Menu", to: "/admin/menu" },
      { label: "Servings Review", to: "/admin/servings-review" },
    ],
  },
  "/admin/menu": {
    title: "Public Menu",
    purpose: "Control which recipes appear on the public menu, in what category and order.",
    whenToUse: "Whenever you publish a new dish or rotate seasonal items.",
  },
  "/admin/generate-recipe-photos": {
    title: "Generate Recipe Photos",
    purpose: "Bulk-generate appetizing AI photos for recipes that don't have one yet.",
    whenToUse: "After importing recipes or when launching a new menu.",
  },
  "/admin/servings-review": {
    title: "Servings Review",
    purpose: "Catch recipes whose serving size looks off compared to similar dishes — prevents under/over-quoting.",
    whenToUse: "After bulk imports or whenever a quote total looks wrong.",
  },
  "/admin/newsletter-guide": {
    title: "Newsletter Guide",
    purpose: "Build the lead-magnet PDF guide sent to recipe-newsletter signups.",
  },

  // ───────── Ingredients ─────────
  "/admin/ingredient-reference": {
    title: "Ingredient Reference",
    purpose: "Canonical list of ingredients with default units, density, and FRED series mappings.",
    whenToUse: "When adding a new staple ingredient or fixing a unit-conversion bug.",
    related: [{ label: "Synonyms", to: "/admin/synonyms" }],
  },
  "/admin/synonyms": {
    title: "Ingredient Synonyms",
    purpose: "Map alternate names (\"hamburger\" → \"ground beef\") so receipts and recipes link correctly.",
    whenToUse: "When auto-link surfaces unknown aliases or a receipt mis-reads a brand name.",
  },
  "/admin/auto-link-ingredients": {
    title: "Auto-Link Ingredients",
    purpose: "Run AI matching to connect free-text recipe ingredients to canonical reference entries.",
    whenToUse: "After importing recipes or scanning a batch of receipts.",
    related: [{ label: "Review Unlinked", to: "/admin/ingredients/review-unlinked" }],
  },
  "/admin/ingredients/review-unlinked": {
    title: "Review Unlinked Ingredients",
    purpose: "Manually resolve recipe ingredients that auto-link couldn't confidently match.",
    whenToUse: "Quick weekly cleanup — keeps costing accurate.",
  },

  // ───────── Inventory & Sourcing ─────────
  "/admin/inventory": {
    title: "Inventory",
    purpose: "Current stock levels, par levels, and average cost per unit for every item.",
    whenToUse: "Before placing orders, or when investigating a costing surprise.",
    related: [{ label: "Suppliers", to: "/admin/suppliers" }],
  },
  "/admin/suppliers": {
    title: "Suppliers",
    purpose: "Vendor directory with contact info, lead times, and historical price data.",
  },
  "/admin/purchase-orders": {
    title: "Purchase Orders",
    purpose: "Create POs from low-stock items, track expected deliveries, reconcile against receipts.",
  },
  "/admin/receipts": {
    title: "Receipts & Costing",
    purpose: "Upload supplier receipts — OCR extracts line items and updates inventory costs automatically.",
    whenToUse: "Every time a delivery arrives.",
  },
  "/admin/uploads": {
    title: "Uploads Inbox",
    purpose: "All recently uploaded receipts, flyers, and quote PDFs awaiting review.",
  },
  "/admin/scan-flyer": {
    title: "Scan Sale Flyer",
    purpose: "Photograph a competitor or supplier sale flyer — AI extracts items and prices into your trends.",
    whenToUse: "Whenever a flyer hits the mailbox.",
  },
  "/admin/sales": {
    title: "Sales Dashboard",
    purpose: "Active sale items detected from scanned flyers — what's cheap right now, where, and until when.",
  },

  // ───────── Events & People ─────────
  "/admin/events": {
    title: "Events",
    purpose: "Confirmed events derived from won quotes — staffing, prep tasks, day-of details.",
    related: [{ label: "Schedule", to: "/admin/schedule" }],
  },
  "/admin/schedule": {
    title: "Schedule",
    purpose: "Calendar view of upcoming events with assigned staff.",
  },
  "/admin/timesheet": {
    title: "Timesheet",
    purpose: "Review and approve clock-in/out entries from the employee portal.",
    whenToUse: "Weekly before payroll.",
  },
  "/admin/employees": {
    title: "Employees",
    purpose: "Staff roster with pay rates, positions, and active status.",
  },
  "/admin/users": {
    title: "User Management",
    purpose: "All registered customers — view their quotes, events, and account status.",
  },
  "/admin/access": {
    title: "Access Control",
    purpose: "Grant or revoke admin and employee permissions, review the access audit log.",
  },
  "/admin/set-password": {
    title: "Set Password",
    purpose: "Set or reset your own admin password — Google sign-in users can add a backup password here.",
  },

  // ───────── System ─────────
  "/admin/integrations": {
    title: "API Integrations",
    purpose: "Status of FRED, Lovable AI, Resend email, and other external services — keys and health checks.",
  },
  "/admin/brand-colors": {
    title: "Brand Colors",
    purpose: "Tweak the design system color tokens used across emails, PDFs, and the public site.",
  },
  "/admin/affiliates": {
    title: "Affiliates & Sponsorships",
    purpose: "Track affiliate programs, referral links, and earnings.",
  },
  "/admin/feedback": {
    title: "Feedback Inbox",
    purpose: "Customer feedback submitted through the public site — triage and respond.",
  },
  "/admin/exports": {
    title: "Exports & Reports",
    purpose: "Download CSV/PDF reports for accounting, tax season, or external review.",
  },
  "/admin/import-recipes": {
    title: "Import from vpsfinest.com",
    purpose: "One-click import of legacy recipes from the old WordPress site.",
    whenToUse: "Run once during initial setup, then occasionally when new recipes are published on the legacy site.",
  },
  "/admin/scan-assets": {
    title: "Scan Site Assets",
    purpose: "Crawl the public site for orphaned images and missing alt text.",
  },
  "/admin/intelligence": {
    title: "Project Intelligence",
    purpose: "Internal audit reports and decision logs — for governance and change management.",
  },
};

export function getPageHelp(route: string): PageHelp | undefined {
  return REGISTRY[route];
}
