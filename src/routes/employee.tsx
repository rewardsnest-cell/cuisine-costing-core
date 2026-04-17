import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSectionAccess } from "@/lib/access/use-section-access";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrepChecklist } from "@/components/employee/PrepChecklist";
import { TimeClock } from "@/components/employee/TimeClock";
import { ShoppingList } from "@/components/employee/ShoppingList";
import {
  Briefcase,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Receipt,
  Users,
  Package,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/employee")({
  head: () => ({
    meta: [
      { title: "Employee Dashboard — TasteQuote" },
      { name: "description", content: "Your assigned events, recipes, and receipts." },
    ],
  }),
  component: EmployeeDashboardPage,
});

function EmployeeDashboardPage() {
  const { user, loading, isEmployee, isAdmin } = useAuth();
  const { access, loading: accessLoading } = useSectionAccess();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [stats, setStats] = useState({ recipes: 0, pendingReceipts: 0 });

  useEffect(() => {
    if (!loading && user && !isEmployee && !isAdmin) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, isEmployee, isAdmin, navigate]);

  useEffect(() => {
    if (!user || (!isEmployee && !isAdmin)) return;
    (async () => {
      const [a, r, rc] = await Promise.all([
        (supabase as any)
          .from("event_assignments")
          .select(
            "id, role, notes, quote:quotes(id, reference_number, client_name, event_type, event_date, guest_count, location_name, status)",
          )
          .eq("employee_user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("recipes").select("id", { count: "exact", head: true }),
        supabase
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      setAssignments((a as any).data || []);
      setStats({
        recipes: (r as any).count || 0,
        pendingReceipts: (rc as any).count || 0,
      });
    })();
  }, [user, isEmployee, isAdmin]);

  if (loading || accessLoading) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="pt-24 pb-16 px-4 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">
            Employee Dashboard
          </h1>
          <p className="text-muted-foreground mb-6">Sign in to access your workspace.</p>
          <Link to="/login">
            <Button className="bg-gradient-warm text-primary-foreground">Sign In</Button>
          </Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (!isEmployee && !isAdmin) return null;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = assignments.filter(
    (a) => a.quote?.event_date && a.quote.event_date >= today,
  );
  const past = assignments.filter(
    (a) => !a.quote?.event_date || a.quote.event_date < today,
  );
  const nextEvent = upcoming[0];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                <h1 className="font-display text-3xl font-bold text-foreground">
                  Employee Dashboard
                </h1>
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                Your assigned events and operational tools.
              </p>
            </div>
            <Link to="/dashboard">
              <Button variant="outline" size="sm" className="gap-2">
                Personal dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<ClipboardList className="w-4 h-4" />}
              label="Upcoming events"
              value={upcoming.length}
            />
            <StatCard
              icon={<CalendarDays className="w-4 h-4" />}
              label="Next event"
              value={nextEvent?.quote?.event_date || "—"}
              small
            />
            <StatCard
              icon={<ChefHat className="w-4 h-4" />}
              label="Recipes available"
              value={stats.recipes}
            />
            <StatCard
              icon={<Receipt className="w-4 h-4" />}
              label="Pending receipts"
              value={stats.pendingReceipts}
            />
          </div>

          {/* Quick actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tools</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {access.assigned_events && (
                <Link to="/my-events">
                  <Button variant="outline" className="gap-2">
                    <ClipboardList className="w-4 h-4" /> My Assigned Events
                  </Button>
                </Link>
              )}
              {access.recipes && (
                <Link to="/admin/recipes">
                  <Button variant="outline" className="gap-2">
                    <ChefHat className="w-4 h-4" /> Recipes
                  </Button>
                </Link>
              )}
              {access.receipts && (
                <Link to="/admin/receipts">
                  <Button variant="outline" className="gap-2">
                    <Receipt className="w-4 h-4" /> Scan Receipts
                  </Button>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin/inventory">
                  <Button variant="outline" className="gap-2">
                    <Package className="w-4 h-4" /> Inventory
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Upcoming assigned events */}
          {access.assigned_events && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" /> Upcoming Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No upcoming events assigned to you.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upcoming.map((a) => (
                      <ExpandableAssignment key={a.id} a={a} userId={user.id} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Past */}
          {access.assigned_events && past.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">
                  Past Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {past.slice(0, 5).map((a) => (
                    <AssignmentRow key={a.id} a={a} muted />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="border border-border/60 rounded-xl p-3 bg-card">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={`font-display font-bold text-foreground mt-1 ${
          small ? "text-base" : "text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ExpandableAssignment({ a, userId }: { a: any; userId: string }) {
  const [open, setOpen] = useState(false);
  const quoteId = a.quote?.id;
  return (
    <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {a.quote?.event_type || "Event"}
              {a.quote?.client_name ? ` — ${a.quote.client_name}` : ""}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {a.quote?.event_date || "No date"}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {a.quote?.guest_count}
              </span>
              {a.quote?.location_name && (
                <span className="truncate">📍 {a.quote.location_name}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              {a.role}
            </span>
            {open ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {a.notes && (
          <p className="text-xs text-muted-foreground mt-2 italic">{a.notes}</p>
        )}
      </button>
      {open && quoteId && (
        <div className="border-t border-border/60 p-3 bg-background/40">
          <Tabs defaultValue="prep">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="prep">Prep</TabsTrigger>
              <TabsTrigger value="clock">Time</TabsTrigger>
              <TabsTrigger value="shopping">Shopping</TabsTrigger>
            </TabsList>
            <TabsContent value="prep" className="mt-3">
              <PrepChecklist quoteId={quoteId} userId={userId} />
            </TabsContent>
            <TabsContent value="clock" className="mt-3">
              <TimeClock quoteId={quoteId} userId={userId} />
            </TabsContent>
            <TabsContent value="shopping" className="mt-3">
              <ShoppingList quoteId={quoteId} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ a, muted }: { a: any; muted?: boolean }) {
  return (
    <div
      className={`border border-border/60 rounded-lg p-3 ${muted ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {a.quote?.event_type || "Event"}
            {a.quote?.client_name ? ` — ${a.quote.client_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {a.quote?.event_date || "No date"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {a.quote?.guest_count}
            </span>
            {a.quote?.location_name && (
              <span className="truncate">📍 {a.quote.location_name}</span>
            )}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary shrink-0">
          {a.role}
        </span>
      </div>
      {a.notes && (
        <p className="text-xs text-muted-foreground mt-2 italic">{a.notes}</p>
      )}
    </div>
  );
}
