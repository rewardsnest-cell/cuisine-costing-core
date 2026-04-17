import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { lovable } from "@/integrations/lovable/index";
import {
  LayoutDashboard, ChefHat, Package, Truck, Receipt, FileText, ShoppingCart, Menu, X, LogOut, Users, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — TasteQuote" },
      { name: "description", content: "Manage recipes, inventory, suppliers, and receipts." },
    ],
  }),
  component: AdminLayout,
});

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/recipes", label: "All Recipes", icon: ChefHat },
  { to: "/admin/inventory", label: "Inventory", icon: Package },
  { to: "/admin/suppliers", label: "Suppliers", icon: Truck },
  { to: "/admin/receipts", label: "Receipts & Costing", icon: Receipt },
  { to: "/admin/quotes", label: "Saved Quotes", icon: FileText },
  { to: "/admin/purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
  { to: "/admin/users", label: "User Management", icon: Users },
];

function AdminLayout() {
  const { user, loading, isAdmin, signIn, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Auth gate
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <AdminLoginGate />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <Shield className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground text-sm mb-6">You don't have admin privileges. Contact an administrator to get access.</p>
          <div className="flex gap-3 justify-center">
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
              <div className="w-7 h-7 rounded-lg bg-gradient-gold flex items-center justify-center">
                <span className="text-gold-foreground font-bold text-xs">TQ</span>
              </div>
              <span className="font-display text-lg font-semibold text-sidebar-foreground">TasteQuote</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.to, item.exact);
              return (
                <Link key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
                  <item.icon className="w-4.5 h-4.5" />
                  {item.label}
                </Link>
              );
            })}
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
          <h1 className="font-display text-lg font-semibold text-foreground truncate">
            {NAV_ITEMS.find((i) => isActive(i.to, i.exact))?.label || "Admin"}
          </h1>
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
