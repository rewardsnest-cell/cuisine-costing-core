/**
 * Deep registry of plain-language descriptions for EVERY route in the app.
 * Used by the project audit and the admin Page Help cards.
 *
 * Add a new entry here whenever you add a new route. Keep wording short,
 * calm, and in plain English — these descriptions are read by humans
 * (admins, auditors, new team members) trying to understand what each
 * URL does and who it is for.
 */

export type RouteAudience = "public" | "auth" | "employee" | "admin" | "system";

export type RouteDescription = {
  /** Human-friendly page title (does not need to match the <title> tag). */
  title: string;
  /** One-paragraph description of what this page does. */
  purpose: string;
  /** Who uses this page. */
  audience: RouteAudience;
  /** Optional: when does someone visit this page. */
  whenToUse?: string;
  /** Optional: notable interactive features on the page. */
  keyActions?: string[];
};

export const ROUTE_DESCRIPTIONS: Record<string, RouteDescription> = {
  // ─────────────────────── PUBLIC MARKETING ───────────────────────
  "/": {
    title: "Home",
    purpose:
      "Public landing page. Introduces VPS Finest with a hero, featured recipes, catering CTA, testimonials and seasonal promo strip.",
    audience: "public",
  },
  "/about": {
    title: "About",
    purpose: "Brand story, photos, and values for the VPS Finest team.",
    audience: "public",
  },
  "/contact": {
    title: "Contact",
    purpose:
      "Contact form and direct contact info. Submissions email the team and log to the feedback inbox.",
    audience: "public",
    keyActions: ["Send a message via the contact form"],
  },
  "/menu": {
    title: "Public Menu",
    purpose:
      "Browses every menu-eligible recipe with category filters, sort order, and (when pricing is enabled) per-person prices and a selection tray.",
    audience: "public",
    keyActions: ["Filter by category", "Sort by name/price", "Add items to a selection tray"],
  },
  "/quote": {
    title: "Get a Quote",
    purpose:
      "Multi-step quote builder — service style, tier, recipes, add-ons, extras. Generates a PDF and saves the quote.",
    audience: "public",
    keyActions: ["Build a multi-step quote", "Download a PDF", "Save quote to account"],
  },
  "/quote/ai": {
    title: "AI Quote Assistant",
    purpose:
      "Conversational quote builder powered by Lovable AI — answers questions and proposes line items.",
    audience: "public",
  },
  "/catering": {
    title: "Catering",
    purpose: "Marketing landing page for catering services with packages and CTAs.",
    audience: "public",
  },
  "/catering/quote": {
    title: "Catering Quote",
    purpose: "Direct entry point into the quote flow for catering inquiries.",
    audience: "public",
  },
  "/recipes": {
    title: "Public Recipes",
    purpose: "Searchable, filterable index of every published recipe.",
    audience: "public",
    keyActions: ["Search recipes", "Filter by tag/category"],
  },
  "/recipes/$id": {
    title: "Recipe Detail",
    purpose:
      "Single recipe view with ingredients, steps, scaler, video (if any), share/print buttons, and email-signup CTA.",
    audience: "public",
    keyActions: ["Scale servings", "Print recipe", "Share to email", "Sign up for recipe newsletter"],
  },
  "/familiar-favorites": {
    title: "Familiar Favorites",
    purpose: "Curated subset of crowd-pleaser recipes for catering inspiration.",
    audience: "public",
  },
  "/familiar-favorites/$id": {
    title: "Familiar Favorite Detail",
    purpose: "Detail view for one familiar-favorite recipe.",
    audience: "public",
  },
  "/inspired": {
    title: "Inspired Menus",
    purpose: "AI/team-curated menu modules to inspire catering selections.",
    audience: "public",
  },
  "/inspired/$id": {
    title: "Inspired Menu Detail",
    purpose: "Detail of one inspired menu module with its recipes and notes.",
    audience: "public",
  },
  "/weddings": {
    title: "Weddings Hub",
    purpose: "Top-level weddings landing — hub for season-specific guides.",
    audience: "public",
  },
  "/weddings/": {
    title: "Weddings Index",
    purpose: "Index of wedding catering guides by season and locale.",
    audience: "public",
  },
  "/weddings/booking-timeline": {
    title: "Wedding Booking Timeline",
    purpose: "Reference timeline for couples planning their wedding catering.",
    audience: "public",
  },
  "/weddings/fall-hudson-ohio": {
    title: "Fall Wedding — Hudson, OH",
    purpose: "Local SEO landing page for fall wedding catering in Hudson, Ohio.",
    audience: "public",
  },
  "/weddings/spring-aurora-ohio": {
    title: "Spring Wedding — Aurora, OH",
    purpose: "Local SEO landing page for spring wedding catering in Aurora, Ohio.",
    audience: "public",
  },
  "/weddings/winter-cleveland-ohio": {
    title: "Winter Wedding — Cleveland, OH",
    purpose: "Local SEO landing page for winter wedding catering in Cleveland, Ohio.",
    audience: "public",
  },
  "/blog": {
    title: "Blog Index",
    purpose: "Index of evergreen catering and wedding blog posts.",
    audience: "public",
  },
  "/blog/fall-wedding-catering-guide": {
    title: "Fall Wedding Catering Guide",
    purpose: "Long-form blog post about fall wedding catering.",
    audience: "public",
  },
  "/blog/spring-wedding-catering-guide": {
    title: "Spring Wedding Catering Guide",
    purpose: "Long-form blog post about spring wedding catering.",
    audience: "public",
  },
  "/blog/winter-wedding-catering-guide": {
    title: "Winter Wedding Catering Guide",
    purpose: "Long-form blog post about winter wedding catering.",
    audience: "public",
  },
  "/guides": {
    title: "Cooking Guides Index",
    purpose: "Index of published how-to cooking guides.",
    audience: "public",
  },
  "/guides/$slug": {
    title: "Cooking Guide Detail",
    purpose: "Single cooking guide article with related ingredients and tools.",
    audience: "public",
  },
  "/coupon/$itemId": {
    title: "Coupon Page",
    purpose: "Public coupon redemption page for a single item promotion.",
    audience: "public",
  },
  "/event/$reference": {
    title: "Public Event Page",
    purpose: "Shareable event reference page (when an event has been published).",
    audience: "public",
  },
  "/follow": {
    title: "Follow / Subscribe",
    purpose: "Landing page for newsletter and social follow links.",
    audience: "public",
  },
  "/lookup": {
    title: "Quote Lookup",
    purpose: "Look up a saved quote by reference code (no login required).",
    audience: "public",
    keyActions: ["Look up a quote by reference"],
  },
  "/privacy": {
    title: "Privacy Policy",
    purpose: "Legal privacy policy.",
    audience: "public",
  },
  "/terms": {
    title: "Terms of Service",
    purpose: "Legal terms of service.",
    audience: "public",
  },

  // ─────────────────────── AUTH ───────────────────────
  "/login": {
    title: "Login",
    purpose: "Sign in with email/password or Google.",
    audience: "public",
  },
  "/signup": {
    title: "Sign Up",
    purpose: "Create a new customer account.",
    audience: "public",
  },
  "/forgot-password": {
    title: "Forgot Password",
    purpose: "Request a password reset email.",
    audience: "public",
  },
  "/reset-password": {
    title: "Reset Password",
    purpose: "Confirm a new password from the emailed reset link.",
    audience: "public",
  },

  // ─────────────────────── AUTHENTICATED CUSTOMER ───────────────────────
  "/dashboard": {
    title: "Customer Dashboard",
    purpose: "Logged-in user's hub — quotes, events, profile shortcuts.",
    audience: "auth",
  },
  "/my-quotes": {
    title: "My Quotes",
    purpose: "List of quotes owned by the signed-in user.",
    audience: "auth",
  },
  "/my-events": {
    title: "My Events",
    purpose: "Upcoming and past events the user is hosting.",
    audience: "auth",
  },

  // ─────────────────────── EMPLOYEE PORTAL ───────────────────────
  "/employee": {
    title: "Employee Portal",
    purpose:
      "Staff dashboard — assigned events, prep checklists, recipe breakdowns, time clock and shopping lists.",
    audience: "employee",
    keyActions: ["Clock in/out", "Mark prep tasks complete", "View shopping list"],
  },

  // ─────────────────────── ADMIN — OVERVIEW ───────────────────────
  "/admin": {
    title: "Admin Dashboard",
    purpose:
      "Daily snapshot of pricing health, recent quotes, low stock and outstanding tasks.",
    audience: "admin",
    whenToUse: "First stop each morning.",
  },
  "/admin/register": {
    title: "Admin Registration",
    purpose: "Self-serve admin account request flow (creates an admin_request).",
    audience: "admin",
  },
  "/admin/set-password": {
    title: "Set Admin Password",
    purpose: "Set or reset your own admin password — useful for Google sign-in users.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — PRICING & COSTING ───────────────────────
  "/admin/national-prices": {
    title: "Pricing Intelligence",
    purpose:
      "Manage USDA/FRED data sources, monthly snapshots and the safety floor that protects quote margins.",
    audience: "admin",
  },
  "/admin/pricing/national": {
    title: "National Pricing (alt)",
    purpose: "Alternate route to national pricing controls.",
    audience: "admin",
  },
  "/admin/pricing-lab": {
    title: "Pricing Lab",
    purpose: "Sandbox for tweaking pricing models and previewing impact across recipes.",
    audience: "admin",
  },
  "/admin/pricing-lab/preview": {
    title: "Pricing Lab Preview",
    purpose: "Side-by-side preview of pricing changes before committing.",
    audience: "admin",
  },
  "/admin/pricing-test": {
    title: "Pricing Test Bench",
    purpose: "Diagnostic tool for verifying pricing math across edge cases.",
    audience: "admin",
  },
  "/admin/pricing-visibility": {
    title: "Pricing Visibility",
    purpose: "Control which pricing fields are shown publicly vs internally.",
    audience: "admin",
  },
  "/admin/margin-volatility": {
    title: "Margin & Volatility",
    purpose: "Track quote margins over time and flag volatile-price ingredients.",
    audience: "admin",
  },
  "/admin/trends": {
    title: "Price Trends",
    purpose: "Charts of historical ingredient prices from receipts, FRED and competitor flyers.",
    audience: "admin",
  },
  "/admin/competitor-trends": {
    title: "Competitor Trends",
    purpose: "Aggregated per-guest pricing across competitors over time.",
    audience: "admin",
  },
  "/admin/cost-queue": {
    title: "Cost Update Queue",
    purpose:
      "Review proposed ingredient cost changes from receipts, Kroger, FRED and historical averages before they go live.",
    audience: "admin",
  },
  "/admin/kroger-pricing": {
    title: "Kroger Pricing",
    purpose: "Trigger Kroger price pulls and review the latest results.",
    audience: "admin",
  },
  "/admin/kroger-runs": {
    title: "Kroger Run History",
    purpose: "History of Kroger ingest runs with status and row counts.",
    audience: "admin",
  },
  "/admin/kroger-sku-review": {
    title: "Kroger SKU Review",
    purpose: "Confirm or reject auto-matched Kroger SKU → ingredient mappings.",
    audience: "admin",
  },
  "/admin/receipt-kroger-diagnostics": {
    title: "Receipt ↔ Kroger Diagnostics",
    purpose: "Diagnostic to compare receipt-derived costs against current Kroger prices.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — QUOTES & COMPETITORS ───────────────────────
  "/admin/quick-quote": {
    title: "Quick Quote",
    purpose: "Fast quote builder with smart defaults and instant PDF.",
    audience: "admin",
  },
  "/admin/quotes": {
    title: "Saved Quotes",
    purpose: "Every quote you've created — filter, edit, convert to event.",
    audience: "admin",
  },
  "/admin/quotes/$id": {
    title: "Quote Detail",
    purpose: "Inspect, edit and re-cost a single quote.",
    audience: "admin",
  },
  "/admin/competitors": {
    title: "Competitors",
    purpose: "Directory of catering competitors you track.",
    audience: "admin",
  },
  "/admin/competitor-quotes/index": {
    title: "Competitor Quotes",
    purpose: "Library of scanned competitor quotes with extracted line items.",
    audience: "admin",
  },
  "/admin/competitor-quotes/$id": {
    title: "Competitor Quote Detail",
    purpose: "Detail view of one scanned competitor quote with the AI counter-quote tool.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — RECIPES & MENU ───────────────────────
  "/admin/recipe-hub": {
    title: "Recipe Hub",
    purpose: "Single source of truth for every recipe — costs, servings, photos, status.",
    audience: "admin",
  },
  "/admin/recipe-hub/$id": {
    title: "Recipe Hub Detail",
    purpose: "Detail view for one recipe in the hub.",
    audience: "admin",
  },
  "/admin/recipes": {
    title: "Recipes (Legacy)",
    purpose: "Older recipes admin list — superseded by Recipe Hub.",
    audience: "admin",
  },
  "/admin/recipes/new": {
    title: "New Recipe",
    purpose: "Create a new recipe.",
    audience: "admin",
  },
  "/admin/recipes/$id/edit": {
    title: "Edit Recipe",
    purpose: "Edit one recipe's name, ingredients, steps, photo and pricing fields.",
    audience: "admin",
  },
  "/admin/menu": {
    title: "Public Menu Control",
    purpose: "Choose which recipes appear on the public menu and in what category.",
    audience: "admin",
  },
  "/admin/menu-modules": {
    title: "Menu Modules",
    purpose: "Group recipes into reusable menu modules for quoting and inspiration.",
    audience: "admin",
  },
  "/admin/menu-modules/preview": {
    title: "Menu Modules Preview",
    purpose: "Preview menu modules as they appear to customers.",
    audience: "admin",
  },
  "/admin/import-recipes": {
    title: "Import Recipes",
    purpose: "One-click import of legacy recipes from vpsfinest.com.",
    audience: "admin",
  },
  "/admin/generate-recipe-photos": {
    title: "Generate Recipe Photos",
    purpose: "Bulk-generate AI photos for recipes that have no image.",
    audience: "admin",
  },
  "/admin/servings-review": {
    title: "Servings Review",
    purpose: "Catch recipes whose serving size looks off compared to similar dishes.",
    audience: "admin",
  },
  "/admin/newsletter-guide": {
    title: "Newsletter Guide",
    purpose: "Build the lead-magnet PDF guide sent to recipe-newsletter signups.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — INGREDIENTS ───────────────────────
  "/admin/ingredient-reference": {
    title: "Ingredient Reference",
    purpose: "Canonical ingredient list with default units, density and FRED mappings.",
    audience: "admin",
  },
  "/admin/synonyms": {
    title: "Ingredient Synonyms",
    purpose: "Map alternate names so receipts/recipes link to the correct canonical ingredient.",
    audience: "admin",
  },
  "/admin/auto-link-ingredients": {
    title: "Auto-Link Ingredients",
    purpose: "Run AI matching to connect free-text ingredients to canonical entries.",
    audience: "admin",
  },
  "/admin/ingredients/review-unlinked": {
    title: "Review Unlinked Ingredients",
    purpose: "Manually resolve ingredients that auto-link could not match.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — INVENTORY & SOURCING ───────────────────────
  "/admin/inventory": {
    title: "Inventory",
    purpose: "Current stock levels, par levels and average cost per unit.",
    audience: "admin",
  },
  "/admin/items": {
    title: "Items",
    purpose: "Item-level inventory and purchase data.",
    audience: "admin",
  },
  "/admin/suppliers": {
    title: "Suppliers",
    purpose: "Vendor directory with contact info, lead times, and price history.",
    audience: "admin",
  },
  "/admin/suppliers/$id": {
    title: "Supplier Detail",
    purpose: "Detail page for one supplier with their items and history.",
    audience: "admin",
  },
  "/admin/purchase-orders": {
    title: "Purchase Orders",
    purpose: "Create POs from low-stock items, track deliveries and reconcile against receipts.",
    audience: "admin",
  },
  "/admin/receipts": {
    title: "Receipts",
    purpose: "Upload supplier receipts — OCR extracts line items and updates inventory costs.",
    audience: "admin",
  },
  "/admin/receipts/review-matches": {
    title: "Receipt Match Review",
    purpose: "Review uncertain receipt-line ↔ inventory matches before applying cost updates.",
    audience: "admin",
  },
  "/admin/uploads": {
    title: "Uploads Inbox",
    purpose: "All recently uploaded receipts, flyers and quote PDFs awaiting review.",
    audience: "admin",
  },
  "/admin/scan-flyer": {
    title: "Scan Sale Flyer",
    purpose: "Photograph a sale flyer — AI extracts items and prices into your trends.",
    audience: "admin",
  },
  "/admin/sale-flyers/$id": {
    title: "Sale Flyer Detail",
    purpose: "Inspect a single scanned sale flyer and its extracted items.",
    audience: "admin",
  },
  "/admin/sales": {
    title: "Active Sales",
    purpose: "Active sale items detected from scanned flyers — what's cheap right now.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — EVENTS & PEOPLE ───────────────────────
  "/admin/events": {
    title: "Events",
    purpose: "Confirmed events derived from won quotes — staffing, prep, day-of details.",
    audience: "admin",
  },
  "/admin/schedule": {
    title: "Schedule",
    purpose: "Calendar view of upcoming events with assigned staff.",
    audience: "admin",
  },
  "/admin/timesheet": {
    title: "Timesheet",
    purpose: "Review and approve clock-in/out entries from the employee portal.",
    audience: "admin",
  },
  "/admin/employees": {
    title: "Employees",
    purpose: "Staff roster with pay rates, positions and active status.",
    audience: "admin",
  },
  "/admin/users": {
    title: "User Management",
    purpose: "All registered customers — view their quotes, events and account status.",
    audience: "admin",
  },
  "/admin/access": {
    title: "Access Control",
    purpose: "Grant/revoke admin and employee permissions; review the access audit log.",
    audience: "admin",
  },
  "/admin/visibility": {
    title: "Feature Visibility",
    purpose: "Phase-gate features (public, private, beta) and toggle nav and SEO indexing.",
    audience: "admin",
  },

  // ─────────────────────── ADMIN — SYSTEM / MISC ───────────────────────
  "/admin/integrations": {
    title: "API Integrations",
    purpose:
      "Status of FRED, Lovable AI, Resend email and other external services — keys and health checks.",
    audience: "admin",
  },
  "/admin/brand-assets": {
    title: "Brand Assets",
    purpose: "Manage logo, favicon and other brand image assets used across the site.",
    audience: "admin",
  },
  "/admin/brand-colors": {
    title: "Brand Colors",
    purpose: "Tweak design-system color tokens used in emails, PDFs and the public site.",
    audience: "admin",
  },
  "/admin/brand-config": {
    title: "Brand Config",
    purpose: "Brand display name and global brand strings.",
    audience: "admin",
  },
  "/admin/affiliates": {
    title: "Affiliates",
    purpose: "Track affiliate programs, referral links and earnings.",
    audience: "admin",
  },
  "/admin/feedback": {
    title: "Feedback Inbox",
    purpose: "Customer feedback submitted through the public site — triage and respond.",
    audience: "admin",
  },
  "/admin/exports": {
    title: "Exports & Reports",
    purpose:
      "Download a Markdown/PDF project audit and export operational data tables as CSV.",
    audience: "admin",
  },
  "/admin/page-inventory": {
    title: "Page Inventory",
    purpose:
      "One row per app route with HTTP reachability, manual review status, and a thumbnail screenshot for public pages.",
    audience: "admin",
    keyActions: [
      "Re-check every route's HTTP status",
      "Capture missing thumbnails via the screenshot service",
      "Mark routes as Reviewed / Needs review / Broken",
    ],
  },
  "/admin/audit": {
    title: "Internal Audit Log",
    purpose: "Read-only system event log with filters and CSV/JSON export.",
    audience: "admin",
  },
  "/admin/change-log": {
    title: "Change Log",
    purpose: "Human-readable change log entries linked to underlying audit events.",
    audience: "admin",
  },
  "/admin/intelligence": {
    title: "Project Intelligence",
    purpose: "Internal audit reports and decision logs — for governance and change management.",
    audience: "admin",
  },
  "/admin/asset-debug": {
    title: "Asset Debug",
    purpose: "Debug page for inspecting site asset URLs and storage paths.",
    audience: "admin",
  },
  "/admin/scan-assets": {
    title: "Scan Site Assets",
    purpose: "Crawl the public site for orphaned images and missing alt text.",
    audience: "admin",
  },
  "/admin/inspired-preview": {
    title: "Inspired Preview",
    purpose: "Preview inspired-menu modules as customers see them.",
    audience: "admin",
  },
  "/admin/guides": {
    title: "Cooking Guides",
    purpose: "List and manage cooking-guide articles.",
    audience: "admin",
  },
  "/admin/guides/new": {
    title: "New Cooking Guide",
    purpose: "Create a new cooking guide article.",
    audience: "admin",
  },
  "/admin/guides/$id": {
    title: "Edit Cooking Guide",
    purpose: "Edit one cooking guide.",
    audience: "admin",
  },
  "/admin/review-inbox": {
    title: "Review Inbox",
    purpose: "Catch-all inbox for items needing admin review.",
    audience: "admin",
  },

  // ─────────────────────── SYSTEM / API / WEBHOOKS ───────────────────────
  "/api/contact": {
    title: "API: Contact form handler",
    purpose: "Server endpoint that accepts public contact form submissions.",
    audience: "system",
  },
  "/api/flipp": {
    title: "API: Flipp grocery prices",
    purpose: "Server endpoint that proxies Flipp grocery flyer data.",
    audience: "system",
  },
  "/api/quote-assistant": {
    title: "API: Quote assistant",
    purpose: "Server endpoint backing the AI quote assistant chat.",
    audience: "system",
  },
  "/api/recipe-signup": {
    title: "API: Recipe newsletter signup",
    purpose: "Server endpoint for recipe-newsletter subscriptions.",
    audience: "system",
  },
  "/api/recipes/$id/printable": {
    title: "API: Printable recipe HTML",
    purpose: "Returns a print-friendly HTML version of one recipe.",
    audience: "system",
  },
  "/email/unsubscribe": {
    title: "Email Unsubscribe",
    purpose: "One-click unsubscribe handler for transactional/marketing emails.",
    audience: "system",
  },
  "/hooks/national-prices-monthly": {
    title: "Cron: Monthly FRED snapshot",
    purpose: "Cron endpoint that pulls FRED monthly snapshots.",
    audience: "system",
  },
  "/hooks/recipe-drip": {
    title: "Cron: Recipe drip emails",
    purpose: "Cron endpoint that sends scheduled recipe drip emails.",
    audience: "system",
  },
  "/lovable/email/auth/preview": {
    title: "Lovable: Auth email preview",
    purpose: "Preview rendered auth emails (signup, magic link, etc.).",
    audience: "system",
  },
  "/lovable/email/auth/webhook": {
    title: "Lovable: Auth email webhook",
    purpose: "Webhook that delivers Supabase auth emails through our brand templates.",
    audience: "system",
  },
  "/lovable/email/queue/process": {
    title: "Lovable: Email queue processor",
    purpose: "Drains the queued-email table and sends pending messages.",
    audience: "system",
  },
  "/lovable/email/suppression": {
    title: "Lovable: Email suppression",
    purpose: "Manages bounced/unsubscribed addresses to prevent re-sending.",
    audience: "system",
  },
  "/lovable/email/transactional/preview": {
    title: "Lovable: Transactional email preview",
    purpose: "Preview rendered transactional emails (recipe welcome, etc.).",
    audience: "system",
  },
  "/lovable/email/transactional/send": {
    title: "Lovable: Transactional email send",
    purpose: "Internal endpoint to send a transactional email through the brand templates.",
    audience: "system",
  },
  "/sitemap.xml": {
    title: "sitemap.xml",
    purpose: "Auto-generated sitemap for search engines.",
    audience: "system",
  },
  "/sitemap[/]xml": {
    title: "sitemap.xml",
    purpose: "Auto-generated sitemap for search engines (router-encoded path).",
    audience: "system",
  },
  "/robots.txt": {
    title: "robots.txt",
    purpose: "Robots directives for search crawlers.",
    audience: "system",
  },
  "/robots[/]txt": {
    title: "robots.txt",
    purpose: "Robots directives for search crawlers (router-encoded path).",
    audience: "system",
  },

  // Router-quirk aliases — TanStack flat-route conventions
  "/blog/index": {
    title: "Blog Index",
    purpose: "Index of evergreen catering and wedding blog posts.",
    audience: "public",
  },
  "/guides/index": {
    title: "Cooking Guides Index",
    purpose: "Index of published how-to cooking guides.",
    audience: "public",
  },
  "/weddings/index": {
    title: "Weddings Index",
    purpose: "Index of wedding catering guides by season and locale.",
    audience: "public",
  },
  "/catering_/quote": {
    title: "Catering Quote",
    purpose: "Direct entry point into the quote flow for catering inquiries.",
    audience: "public",
  },
  "/quote_/ai": {
    title: "AI Quote Assistant",
    purpose:
      "Conversational quote builder powered by Lovable AI — answers questions and proposes line items.",
    audience: "public",
  },
  "/recipes_/$id": {
    title: "Recipe Detail",
    purpose:
      "Single recipe view with ingredients, steps, scaler, video, share/print buttons, and email-signup CTA.",
    audience: "public",
  },
  "/familiar-favorites_/$id": {
    title: "Familiar Favorite Detail",
    purpose: "Detail view for one familiar-favorite recipe.",
    audience: "public",
  },
  "/inspired_/$id": {
    title: "Inspired Menu Detail",
    purpose: "Detail of one inspired menu module with its recipes and notes.",
    audience: "public",
  },
};

export function describeRoute(path: string): RouteDescription | undefined {
  return ROUTE_DESCRIPTIONS[path];
}
