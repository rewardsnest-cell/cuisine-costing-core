import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { lovable } from "@/integrations/lovable/index";
import {
  LayoutDashboard, ChefHat, Package, Truck, Receipt, FileText, ShoppingCart, Menu, X, LogOut, Users, Shield, KeyRound, UserCog, CalendarDays, Calendar, ShieldCheck, Clock, Tag, TrendingUp, ScanLine, FileSearch, Building2, BookOpen, Globe2, Palette, UtensilsCrossed, Home, Sparkles, Plug, Mail, EyeOff, FlaskConical, ClipboardCheck, NotebookPen, Lock, Phone, Star, ListChecks, MessageSquareQuote, Repeat, ClipboardList, BookOpenCheck, CalendarCheck,
} from "lucide-react";
import { useBrandAsset } from "@/lib/brand-assets";
import { useBrandName } from "@/lib/brand-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/LoadingState";
import { useFeatureVisibilityMap, type FeatureVisibility } from "@/lib/feature-visibility";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — VPS Finest" },
      { name: "description", content: "Manage recipes, inventory, suppliers, and receipts." },
    ],
  }),
  component: AdminLayout,
});

// Phase-aligned admin navigation. Every item references a feature_key in the
// feature_visibility table. Items are filtered out at render time when the
// corresponding flag is hidden, but routes themselves remain reachable by
// direct URL so admins can re-enable anything from /admin/visibility.
type NavItem = { to: string; label: string; icon: any; exact?: boolean; featureKey?: string };
type NavGroup = { label: string; items: NavItem[]; featureKey?: string; phaseNote?: string };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Home", icon: Home, exact: true },
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Quotes",
    items: [
      { to: "/admin/quotes",     label: "Saved Quotes",     icon: FileText,     featureKey: "admin_quotes" },
      { to: "/admin/quote-lab",  label: "Quote Lab",        icon: FlaskConical, featureKey: "admin_quote_lab" },
      { to: "/admin/review-inbox", label: "AI Quote Review", icon: ClipboardCheck, featureKey: "admin_quote_ai_review" },
    ],
  },
  {
    label: "Menu & Content",
    items: [
      { to: "/admin/recipe-hub",        label: "Recipe Hub",                 icon: ChefHat,         featureKey: "admin_recipe_hub" },
      { to: "/admin/menu",              label: "Public Menu Control",        icon: UtensilsCrossed, featureKey: "admin_menu_control" },
      { to: "/admin/menu-modules",      label: "Menu Modules",               icon: UtensilsCrossed, featureKey: "admin_menu_modules" },
      { to: "/admin/inspired-preview",  label: "Familiar Favorites Preview", icon: Sparkles,        featureKey: "admin_inspired_preview" },
      { to: "/admin/guides",            label: "Cooking Guides",             icon: NotebookPen,     featureKey: "admin_cooking_guides" },
      { to: "/admin/newsletter-guide",  label: "Newsletter Guide",           icon: Mail,            featureKey: "admin_newsletter_guide" },
    ],
  },
  {
    label: "Sales Hub",
    featureKey: "admin_sales_hub",
    items: [
      { to: "/admin/sales-hub",                 label: "Sales Dashboard",   icon: ListChecks,         featureKey: "admin_sales_hub" },
      { to: "/admin/sales-hub/prospects",       label: "Prospects",         icon: Users,              featureKey: "admin_sales_prospects" },
      { to: "/admin/sales-hub/scripts",         label: "Sales Scripts",     icon: MessageSquareQuote, featureKey: "admin_sales_scripts" },
      { to: "/admin/sales-hub/daily",           label: "Daily Checklist",   icon: ClipboardList,      featureKey: "admin_sales_daily" },
      { to: "/admin/sales-hub/events",          label: "Event Checklist",   icon: CalendarCheck,      featureKey: "admin_sales_events_checklist" },
      { to: "/admin/sales-hub/reviews",         label: "Reviews",           icon: Star,               featureKey: "admin_sales_reviews" },
      { to: "/admin/sales-hub/follow-ups",      label: "Follow-Ups",        icon: Mail,               featureKey: "admin_sales_followups" },
      { to: "/admin/sales-hub/referrals",       label: "Referrals",         icon: Repeat,             featureKey: "admin_sales_referrals" },
      { to: "/admin/sales-hub/weekly-review",   label: "Weekly Review",     icon: BookOpenCheck,      featureKey: "admin_sales_weekly_review" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/events",          label: "Events",          icon: CalendarDays, featureKey: "admin_events" },
      { to: "/admin/schedule",        label: "Schedule",        icon: Calendar,     featureKey: "admin_schedule" },
      { to: "/admin/employees",       label: "Employees",       icon: UserCog,      featureKey: "admin_employees" },
      { to: "/admin/timesheet",       label: "Timesheets",      icon: Clock,        featureKey: "admin_timesheets" },
      { to: "/admin/inventory",       label: "Inventory",       icon: Package,      featureKey: "admin_inventory" },
      { to: "/admin/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, featureKey: "admin_purchase_orders" },
    ],
  },
  {
    label: "Market Intelligence",
    items: [
      { to: "/admin/competitors",        label: "Competitors",        icon: Building2,  featureKey: "admin_competitors" },
      { to: "/admin/competitor-quotes",  label: "Competitor Quotes",  icon: FileSearch, featureKey: "admin_competitor_quotes" },
      { to: "/admin/competitor-trends",  label: "Competitor Trends",  icon: TrendingUp, featureKey: "admin_competitor_trends" },
      { to: "/admin/sales",              label: "Sales Flyers",       icon: Tag,        featureKey: "admin_sales_flyers" },
    ],
  },
  {
    label: "System & Governance",
    items: [
      { to: "/admin/pages",          label: "Admin Pages Registry",   icon: LayoutDashboard, featureKey: "admin_pages_registry" },
      { to: "/admin/visibility",       label: "Feature Visibility",     icon: Globe2,      featureKey: "admin_feature_visibility" },
      { to: "/admin/page-inventory",   label: "Page Inventory",         icon: FileSearch,  featureKey: "admin_page_inventory" },
      { to: "/admin/audit",            label: "Audit Log",              icon: Shield,      featureKey: "admin_audit_log" },
      { to: "/admin/exports",          label: "Exports & Reports",      icon: FileText,    featureKey: "admin_exports" },
      { to: "/admin/downloads",        label: "Downloads Hub",          icon: FileText,    featureKey: "admin_downloads" },
      { to: "/admin/change-log",       label: "Change Log",             icon: NotebookPen, featureKey: "admin_change_log" },
      { to: "/admin/intelligence",     label: "Project Intelligence",   icon: ShieldCheck, featureKey: "admin_project_intelligence" },
      { to: "/admin/access",           label: "Access Control",         icon: ShieldCheck, featureKey: "admin_access_control" },
      { to: "/admin/integrations",     label: "Integrations",           icon: Plug,        featureKey: "admin_integrations" },
      { to: "/admin/brand-config",     label: "Brand Management",       icon: Palette,     featureKey: "admin_brand_management" },
    ],
  },
  {
    label: "Pricing Intelligence",
    featureKey: "admin_pricing_intelligence",
    phaseNote: "Phase Three · hidden until enabled",
    items: [
      { to: "/admin/pricing-pipeline",     label: "Pricing Pipeline",       icon: ShieldCheck,     featureKey: "admin_pricing_pipeline" },
      { to: "/admin/pricing-lab",          label: "Pricing Lab",            icon: FlaskConical,    featureKey: "admin_pricing_lab" },
      { to: "/admin/pricing-lab/preview",  label: "Pricing Lab Preview",    icon: FlaskConical,    featureKey: "admin_pricing_lab_preview" },
      { to: "/admin/pricing-test",         label: "Pricing Test",           icon: FlaskConical,    featureKey: "admin_pricing_test" },
      { to: "/admin/pricing-visibility",   label: "Pricing Visibility",     icon: EyeOff,          featureKey: "admin_pricing_visibility" },
      { to: "/admin/margin-volatility",    label: "Margin & Volatility",    icon: TrendingUp,      featureKey: "admin_margin_volatility" },
      { to: "/admin/national-prices",      label: "National Prices",        icon: Globe2,          featureKey: "admin_national_prices" },
      { to: "/admin/trends",               label: "Price Trends",           icon: TrendingUp,      featureKey: "admin_price_trends" },
      { to: "/admin/kroger-pricing",       label: "Kroger Pricing",         icon: Tag,             featureKey: "admin_kroger_pricing" },
      { to: "/admin/kroger-sku-review",    label: "Kroger SKU Review",      icon: ClipboardCheck,  featureKey: "admin_kroger_sku_review" },
      { to: "/admin/cost-queue",           label: "Cost Update Queue",      icon: ClipboardCheck,  featureKey: "admin_cost_queue" },
      { to: "/admin/receipts",             label: "Receipt Diagnostics",    icon: Receipt,         featureKey: "admin_receipt_diagnostics" },
      { to: "/admin/pricing-code-inventory", label: "Pricing Code Inventory", icon: FileSearch,    featureKey: "admin_pricing_code_inventory" },
    ],
  },
];

/**
 * A nav row is visible when:
 *  - it has no featureKey (always-on shell items like Home/Dashboard), OR
 *  - the registry hasn't loaded yet (avoid flicker — show until proven hidden), OR
 *  - the flag's phase is not "off" AND nav_enabled is true.
 *
 * Routes themselves remain reachable by direct URL — this only filters the
 * sidebar. Admins can re-enable any feature instantly via /admin/visibility.
 */
function isNavItemVisible(item: NavItem, map: Map<string, FeatureVisibility> | null): boolean {
  if (!item.featureKey) return true;
  if (!map) return true;
  const row = map.get(item.featureKey);
  if (!row) return false; // unregistered admin keys are hidden by default
  if (row.phase === "off") return false;
  return row.nav_enabled !== false;
}

function isNavGroupVisible(group: NavGroup, map: Map<string, FeatureVisibility> | null): boolean {
  if (!group.featureKey) return true;
  if (!map) return true;
  const row = map.get(group.featureKey);
  if (!row) return false;
  if (row.phase === "off") return false;
  return row.nav_enabled !== false;
}

function AdminLayout() {
  const { user, loading, isAdmin, signIn, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { map: visibilityMap } = useFeatureVisibilityMap();

  // Filter groups + items down to what the current visibility flags allow.
  // Routes themselves are NOT removed — only nav links are gated.
  const visibleGroups = useMemo(() => {
    return NAV_GROUPS
      .filter((g) => isNavGroupVisible(g, visibilityMap))
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => isNavItemVisible(it, visibilityMap)),
      }))
      .filter((g) => g.items.length > 0);
  }, [visibilityMap]);

  const visibleItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items),
    [visibleGroups],
  );

  // Auth gate
  if (loading) {
    return <LoadingState fullScreen label="Checking your session…" />;
  }

  if (!user) {
    return <AdminLoginGate />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <Shield className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Admin Access Required</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Your account doesn't have admin access. You can request approval from an existing administrator.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/admin/register"><Button className="bg-gradient-warm text-primary-foreground">Request Access</Button></Link>
            <Link to="/"><Button variant="outline">Go Home</Button></Link>
            <Button variant="ghost" onClick={() => signOut()}>Sign Out</Button>
          </div>
        </div>
      </div>
    );
  }

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transform transition-transform lg:translate-x-0 lg:static lg:flex-shrink-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-full flex flex-col">
          <div className="h-16 flex items-center justify-between px-5 border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-2">
              <AdminSidebarLogo />
              <AdminSidebarBrandName />
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 py-4 px-3 overflow-y-auto">
            {visibleGroups.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 flex items-center gap-1.5">
                  <span>{group.label}</span>
                  {group.phaseNote && (
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal text-[10px] text-amber-500/80">
                      <Lock className="w-3 h-3" />
                      {group.phaseNote}
                    </span>
                  )}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.to, item.exact);
                    return (
                      <Link key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
                        <item.icon className="w-4.5 h-4.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-sidebar-border space-y-1">
            <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50 truncate">{user.email}</div>
            <button onClick={() => signOut()}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full">
              <LogOut className="w-4.5 h-4.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-foreground/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-4 px-4 sm:px-6 border-b border-border bg-card">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg font-semibold text-foreground truncate flex-1">
            {visibleItems.find((i) => isActive(i.to, i.exact))?.label || "Admin"}
          </h1>
          <Link to="/admin/scan-flyer">
            <Button size="sm" className="bg-gradient-warm text-primary-foreground gap-1.5">
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Scan Flyer</span>
            </Button>
          </Link>
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminLoginGate() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setSubmitting(false);
  };

  const handleGoogle = async () => {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/admin",
    });
    if (result.error) {
      setError(result.error instanceof Error ? result.error.message : String(result.error));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-gradient-warm flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">TQ</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Admin Sign In</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in with your admin account</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <Button type="button" variant="outline" className="w-full gap-2 mb-4" onClick={handleGoogle}>
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </Button>
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full bg-gradient-warm text-primary-foreground" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Need an admin account? <Link to="/admin/register" className="text-primary font-medium hover:underline">Register</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminSidebarLogo() {
  const { data: brandLogoUrl } = useBrandAsset("primary_logo");
  const { display } = useBrandName();
  if (brandLogoUrl) {
    return (
      <img
        src={brandLogoUrl}
        alt={display}
        className="w-7 h-7 rounded-lg object-contain"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-lg bg-gradient-gold flex items-center justify-center">
      <span className="text-gold-foreground font-bold text-xs">TQ</span>
    </div>
  );
}

function AdminSidebarBrandName() {
  const { display } = useBrandName();
  return <span className="font-display text-lg font-semibold text-sidebar-foreground">{display}</span>;
}
