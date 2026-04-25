import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, Sun, Target, Bell, ArrowRight, Phone, Star,
  CalendarCheck, AlertTriangle, RefreshCw, ChevronRight, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";

export const Route = createFileRoute("/admin/daily-dashboard")({
  component: DailyDashboardPage,
});

type Priority = {
  id: string;
  title: string;
  notes: string | null;
  done: boolean;
  position: number;
  due_date: string;
};

type WeeklyGoal = {
  id: string;
  title: string;
  notes: string | null;
  target_value: number | null;
  progress_value: number;
  unit: string | null;
  done: boolean;
  week_start: string;
  position: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function weekStartISO() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Monday-start
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}
function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function DailyDashboardPage() {
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [newPriority, setNewPriority] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [loading, setLoading] = useState(true);

  // Reminders state
  const [followUpsDue, setFollowUpsDue] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [pricingAlerts, setPricingAlerts] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [trend, setTrend] = useState<Array<{ week: string; target: number; completed: number; pct: number }>>([]);

  const today = todayISO();
  const wkStart = weekStartISO();

  const loadCore = async () => {
    setLoading(true);
    const [{ data: pri }, { data: gls }] = await Promise.all([
      (supabase as any)
        .from("admin_daily_priorities")
        .select("*")
        .eq("due_date", today)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("admin_weekly_goals")
        .select("*")
        .eq("week_start", wkStart)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    setPriorities(pri || []);
    setGoals(gls || []);
    setLoading(false);
  };

  const loadReminders = async () => {
    // Follow-ups due (Day 1/5/14 from sales_prospects) — fail silently if table missing
    try {
      const { data } = await (supabase as any)
        .from("sales_prospects")
        .select("id, business_name, city, last_contacted, next_follow_up, status, phone, email")
        .neq("status", "Archived")
        .neq("status", "Booked")
        .order("last_contacted", { ascending: true, nullsFirst: false });
      const due = (data || []).filter((p: any) => {
        if (p.next_follow_up && p.next_follow_up <= today) return true;
        const d = daysSince(p.last_contacted);
        return d !== null && (d === 1 || d === 5 || d >= 14);
      });
      setFollowUpsDue(due.slice(0, 5));
    } catch { /* ignore */ }

    // Pending review asks — recent quotes without a sales_review_asks entry
    try {
      const { data: quotes } = await (supabase as any)
        .from("quotes")
        .select("id, customer_name, event_date, status")
        .gte("event_date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
        .lte("event_date", today)
        .order("event_date", { ascending: false })
        .limit(20);
      const { data: asks } = await (supabase as any)
        .from("sales_review_asks")
        .select("quote_id");
      const askedIds = new Set((asks || []).map((a: any) => a.quote_id));
      setPendingReviews((quotes || []).filter((q: any) => !askedIds.has(q.id)).slice(0, 5));
    } catch { /* ignore */ }

    // Pricing pipeline alerts — pending cost updates
    try {
      const { count } = await (supabase as any)
        .from("cost_update_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPricingAlerts(count || 0);
    } catch { /* ignore */ }

    // Upcoming events (next 7 days)
    try {
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("quotes")
        .select("id, customer_name, event_date, guest_count, status")
        .gte("event_date", today)
        .lte("event_date", in7)
        .order("event_date", { ascending: true });
      setUpcomingEvents((data || []).slice(0, 5));
    } catch { /* ignore */ }
  };

  const loadTrend = async () => {
    // Pull last 8 weeks of weekly goals and aggregate target vs completed per week.
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 86400000).toISOString().slice(0, 10);
    const { data } = await (supabase as any)
      .from("admin_weekly_goals")
      .select("week_start, target_value, progress_value, done")
      .gte("week_start", eightWeeksAgo)
      .order("week_start", { ascending: true });
    const byWeek = new Map<string, { target: number; completed: number }>();
    for (const g of (data || []) as any[]) {
      const wk = g.week_start as string;
      const tgt = Number(g.target_value) || 0;
      // "Completed" = capped progress (so over-shooting doesn't inflate the line)
      const rawProg = Number(g.progress_value) || 0;
      const prog = tgt > 0 ? Math.min(rawProg, tgt) : (g.done ? 1 : 0);
      const effTarget = tgt > 0 ? tgt : 1; // count goals without explicit target as 1-unit
      const cur = byWeek.get(wk) || { target: 0, completed: 0 };
      cur.target += effTarget;
      cur.completed += prog;
      byWeek.set(wk, cur);
    }
    const points = Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, v]) => ({
        week: week.slice(5), // MM-DD
        target: Math.round(v.target * 10) / 10,
        completed: Math.round(v.completed * 10) / 10,
        pct: v.target > 0 ? Math.round((v.completed / v.target) * 100) : 0,
      }));
    setTrend(points);
  };

  useEffect(() => { loadCore(); loadReminders(); loadTrend(); }, []);

  // Priorities
  const addPriority = async () => {
    const title = newPriority.trim();
    if (!title) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("admin_daily_priorities").insert({
      title, due_date: today, position: priorities.length, created_by: u.user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    setNewPriority("");
    loadCore();
  };
  const togglePriority = async (p: Priority) => {
    const { error } = await (supabase as any)
      .from("admin_daily_priorities").update({ done: !p.done }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setPriorities(prev => prev.map(x => x.id === p.id ? { ...x, done: !x.done } : x));
  };
  const removePriority = async (id: string) => {
    const { error } = await (supabase as any).from("admin_daily_priorities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setPriorities(prev => prev.filter(x => x.id !== id));
  };
  const carryUnfinished = async () => {
    // Move yesterday's unfinished into today
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data, error } = await (supabase as any)
      .from("admin_daily_priorities")
      .update({ due_date: today })
      .eq("due_date", y).eq("done", false).select("id");
    if (error) return toast.error(error.message);
    toast.success(`Carried ${data?.length ?? 0} item(s) to today`);
    loadCore();
  };

  // Weekly goals
  const addGoal = async () => {
    const title = newGoal.trim();
    if (!title) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("admin_weekly_goals").insert({
      title, week_start: wkStart, position: goals.length, created_by: u.user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    setNewGoal("");
    loadCore();
  };
  const updateGoal = async (g: WeeklyGoal, patch: Partial<WeeklyGoal>) => {
    const { error } = await (supabase as any).from("admin_weekly_goals").update(patch).eq("id", g.id);
    if (error) return toast.error(error.message);
    setGoals(prev => prev.map(x => x.id === g.id ? { ...x, ...patch } : x));
  };
  const removeGoal = async (id: string) => {
    const { error } = await (supabase as any).from("admin_weekly_goals").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setGoals(prev => prev.filter(x => x.id !== id));
  };

  const completedCount = useMemo(() => priorities.filter(p => p.done).length, [priorities]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · Week of {wkStart}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadCore(); loadReminders(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={carryUnfinished}>
            <ArrowRight className="h-4 w-4 mr-1" /> Carry over yesterday
          </Button>
        </div>
      </div>

      {/* Top row: priorities + goals */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Daily priorities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" /> Today's Priorities
              <Badge variant="secondary" className="ml-auto">
                {completedCount}/{priorities.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Add a priority for today…"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPriority()}
              />
              <Button onClick={addPriority} size="icon"><Plus className="h-4 w-4" /></Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : priorities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No priorities yet. Add one above.</p>
            ) : (
              <ul className="space-y-2">
                {priorities.map(p => (
                  <li key={p.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                    <Checkbox checked={p.done} onCheckedChange={() => togglePriority(p)} className="mt-0.5" />
                    <span className={`flex-1 text-sm ${p.done ? "line-through text-muted-foreground" : ""}`}>
                      {p.title}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => removePriority(p.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Weekly goals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Weekly Goals
              <Badge variant="secondary" className="ml-auto">{goals.filter(g => g.done).length}/{goals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Add a weekly goal…"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGoal()}
              />
              <Button onClick={addGoal} size="icon"><Plus className="h-4 w-4" /></Button>
            </div>
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No goals yet for this week.</p>
            ) : (
              <ul className="space-y-3">
                {goals.map(g => {
                  const pct = g.target_value && g.target_value > 0
                    ? Math.min(100, Math.round((g.progress_value / g.target_value) * 100)) : (g.done ? 100 : 0);
                  return (
                    <li key={g.id} className="p-3 rounded-md border space-y-2">
                      <div className="flex items-start gap-2">
                        <Checkbox checked={g.done} onCheckedChange={() => updateGoal(g, { done: !g.done })} className="mt-1" />
                        <span className={`flex-1 text-sm font-medium ${g.done ? "line-through text-muted-foreground" : ""}`}>
                          {g.title}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => removeGoal(g.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" inputMode="decimal" placeholder="Progress" className="h-8 w-24"
                          value={g.progress_value ?? 0}
                          onChange={(e) => updateGoal(g, { progress_value: Number(e.target.value) })}
                        />
                        <span className="text-xs text-muted-foreground">/</span>
                        <Input
                          type="number" inputMode="decimal" placeholder="Target" className="h-8 w-24"
                          value={g.target_value ?? ""}
                          onChange={(e) => updateGoal(g, { target_value: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <Input
                          placeholder="unit" className="h-8 w-20"
                          value={g.unit ?? ""}
                          onChange={(e) => updateGoal(g, { unit: e.target.value || null })}
                        />
                        <Badge variant="outline" className="ml-auto">{pct}%</Badge>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reminders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Quick Reminders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Follow-ups */}
            <ReminderBlock
              icon={<Phone className="h-4 w-4" />}
              title="Follow-ups due today"
              count={followUpsDue.length}
              empty="No follow-ups due. Nice work."
              actionLabel="Open follow-ups"
              actionTo="/admin/sales-hub/follow-ups"
            >
              {followUpsDue.map((p: any) => (
                <li key={p.id} className="text-sm flex items-center gap-2">
                  <span className="flex-1 truncate">{p.business_name} <span className="text-muted-foreground">· {p.city}</span></span>
                  <Badge variant="outline" className="text-xs">{p.status}</Badge>
                </li>
              ))}
            </ReminderBlock>

            {/* Pending review asks */}
            <ReminderBlock
              icon={<Star className="h-4 w-4" />}
              title="Pending review asks"
              count={pendingReviews.length}
              empty="All recent customers covered."
              actionLabel="Open reviews"
              actionTo="/admin/sales-hub/reviews"
            >
              {pendingReviews.map((q: any) => (
                <li key={q.id} className="text-sm flex items-center gap-2">
                  <span className="flex-1 truncate">{q.customer_name || "Customer"} <span className="text-muted-foreground">· {q.event_date}</span></span>
                </li>
              ))}
            </ReminderBlock>

            {/* Pricing alerts */}
            <ReminderBlock
              icon={<AlertTriangle className="h-4 w-4" />}
              title="Pricing pipeline alerts"
              count={pricingAlerts}
              empty="Pricing pipeline is clean."
              actionLabel="Open pricing pipeline"
              actionTo="/admin/pricing-pipeline"
            >
              {pricingAlerts > 0 && (
                <li className="text-sm text-muted-foreground">
                  {pricingAlerts} cost update{pricingAlerts === 1 ? "" : "s"} pending review.
                </li>
              )}
            </ReminderBlock>

            {/* Upcoming events */}
            <ReminderBlock
              icon={<CalendarCheck className="h-4 w-4" />}
              title="Upcoming events (7 days)"
              count={upcomingEvents.length}
              empty="No events booked this week."
              actionLabel="Open events"
              actionTo="/admin/events"
            >
              {upcomingEvents.map((q: any) => (
                <li key={q.id} className="text-sm flex items-center gap-2">
                  <span className="flex-1 truncate">{q.customer_name || "Event"} <span className="text-muted-foreground">· {q.event_date}</span></span>
                  {q.guest_count ? <Badge variant="outline" className="text-xs">{q.guest_count} guests</Badge> : null}
                </li>
              ))}
            </ReminderBlock>
          </div>

          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            Reminders pull live from sales follow-ups, recent quotes, the pricing queue, and the events calendar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReminderBlock({
  icon, title, count, empty, actionLabel, actionTo, children,
}: {
  icon: React.ReactNode; title: string; count: number; empty: string;
  actionLabel: string; actionTo: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{title}</span>
        <Badge variant={count > 0 ? "default" : "secondary"} className="ml-auto">{count}</Badge>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{empty}</p>
      ) : (
        <ul className="space-y-1.5 max-h-40 overflow-auto">{children}</ul>
      )}
      <Link to={actionTo as any} className="inline-flex items-center text-xs text-primary hover:underline pt-1">
        {actionLabel} <ChevronRight className="h-3 w-3 ml-0.5" />
      </Link>
    </div>
  );
}
