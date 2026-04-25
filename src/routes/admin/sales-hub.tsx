import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Phone, Mail, Star, ListChecks, Users, MessageSquareQuote,
  CalendarCheck, Repeat, ClipboardList, BookOpenCheck,
} from "lucide-react";

export const Route = createFileRoute("/admin/sales-hub")({
  component: SalesHubLayout,
});

const SUB_NAV = [
  { to: "/admin/sales-hub", label: "Dashboard", icon: ListChecks, exact: true },
  { to: "/admin/sales-hub/prospects", label: "Prospects", icon: Users },
  { to: "/admin/sales-hub/scripts", label: "Scripts", icon: MessageSquareQuote },
  { to: "/admin/sales-hub/daily", label: "Daily Checklist", icon: ClipboardList },
  { to: "/admin/sales-hub/events", label: "Event Checklist", icon: CalendarCheck },
  { to: "/admin/sales-hub/reviews", label: "Reviews", icon: Star },
  { to: "/admin/sales-hub/follow-ups", label: "Follow-Ups", icon: Mail },
  { to: "/admin/sales-hub/referrals", label: "Referrals", icon: Repeat },
  { to: "/admin/sales-hub/weekly-review", label: "Weekly Review", icon: BookOpenCheck },
];

function SalesHubLayout() {
  const location = useLocation();
  const isDashboard = location.pathname === "/admin/sales-hub";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Sales Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One place for prospects, scripts, daily execution, reviews, and follow-up. Calm and consistent beats perfect.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2">
        {SUB_NAV.map((item) => {
          const active = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted border-border text-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {isDashboard ? <SalesHubDashboard /> : <Outlet />}
    </div>
  );
}

function SalesHubDashboard() {
  const { user } = useAuth();
  const [followupCount, setFollowupCount] = useState<number | null>(null);
  const [todaysContacts, setTodaysContacts] = useState<number | null>(null);
  const [weekContacts, setWeekContacts] = useState<number | null>(null);
  const [reviewsThisWeek, setReviewsThisWeek] = useState<number | null>(null);
  const [todayChecklist, setTodayChecklist] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekStartIso = weekStart.toISOString();

      const [followups, contactsToday, contactsWeek, reviews, checklist] = await Promise.all([
        (supabase as any).from("sales_prospects").select("id", { count: "exact", head: true }).lte("next_follow_up", todayIso),
        (supabase as any).from("sales_contact_log").select("id", { count: "exact", head: true }).gte("contacted_at", `${todayIso}T00:00:00`),
        (supabase as any).from("sales_contact_log").select("id", { count: "exact", head: true }).gte("contacted_at", weekStartIso),
        (supabase as any).from("sales_review_asks").select("id", { count: "exact", head: true }).eq("review_received", true).gte("asked_at", weekStartIso),
        user
          ? (supabase as any).from("sales_daily_checklist").select("*").eq("user_id", user.id).eq("day", todayIso).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setFollowupCount(followups.count ?? 0);
      setTodaysContacts(contactsToday.count ?? 0);
      setWeekContacts(contactsWeek.count ?? 0);
      setReviewsThisWeek(reviews.count ?? 0);
      setTodayChecklist(checklist?.data ?? null);
    };
    load();
  }, [user]);

  const checklistItems = [
    { key: "calls_done", label: "5 phone calls" },
    { key: "emails_done", label: "5 emails" },
    { key: "walkins_done", label: "2 walk-ins" },
    { key: "leads_logged", label: "Leads logged" },
    { key: "followups_scheduled", label: "Follow-ups scheduled" },
    { key: "opportunity_moved", label: "One opportunity moved forward" },
  ];
  const completed = checklistItems.filter((i) => todayChecklist?.[i.key]).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Follow-ups due today" value={followupCount ?? "…"} icon={<Mail className="w-5 h-5" />} to="/admin/sales-hub/follow-ups" />
        <Stat label="Contacts logged today" value={todaysContacts ?? "…"} icon={<Phone className="w-5 h-5" />} to="/admin/sales-hub/daily" />
        <Stat label="Outreach this week" value={weekContacts ?? "…"} icon={<ListChecks className="w-5 h-5" />} to="/admin/sales-hub/weekly-review" />
        <Stat label="Reviews gained this week" value={reviewsThisWeek ?? "…"} icon={<Star className="w-5 h-5" />} to="/admin/sales-hub/reviews" />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Today's Checklist</h2>
              <p className="text-xs text-muted-foreground">{completed} of {checklistItems.length} complete</p>
            </div>
            <Link to="/admin/sales-hub/daily">
              <Button size="sm">Open</Button>
            </Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklistItems.map((i) => {
              const done = todayChecklist?.[i.key];
              return (
                <li key={i.key} className={`flex items-center gap-2 text-sm px-3 py-2 rounded border ${done ? "bg-success/10 border-success/30 text-foreground" : "bg-muted/30 border-border text-muted-foreground"}`}>
                  <span className={`w-4 h-4 rounded border ${done ? "bg-success border-success" : "border-muted-foreground/40"}`} />
                  {i.label}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold mb-3">Quick Reminders</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Make calls — short, calm, professional.</li>
            <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Send follow-ups — Day 1, Day 5, Day 14.</li>
            <li className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> Ask happy clients for a Google review within 24 hours.</li>
            <li className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" /> Log every contact so the follow-up queue stays accurate.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon, to }: { label: string; value: number | string; icon: React.ReactNode; to: string }) {
  return (
    <Link to={to}>
      <Card className="hover:border-primary/40 transition-colors h-full">
        <CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center">{icon}</div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold font-display">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export { SUB_NAV };
