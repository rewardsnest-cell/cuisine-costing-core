import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, MapPin, Users, ExternalLink, CalendarDays, Filter } from "lucide-react";

export const Route = createFileRoute("/admin/schedule")({
  head: () => ({ meta: [{ title: "Schedule — TasteQuote Admin" }] }),
  component: SchedulePage,
});

type EventRow = {
  id: string;
  reference_number: string | null;
  client_name: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  location_name: string | null;
  status: string;
};

type Assignment = {
  id: string;
  quote_id: string;
  employee_user_id: string;
  role: string;
};

type ProfileLite = { user_id: string; full_name: string | null; email: string | null };
type View = "month" | "week";

const ROLE_COLORS: Record<string, string> = {
  Lead: "bg-primary/15 text-primary",
  Cook: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Server: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  Driver: "bg-green-500/15 text-green-700 dark:text-green-400",
  Other: "bg-muted text-muted-foreground",
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function SchedulePage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<EventRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [allEmployees, setAllEmployees] = useState<ProfileLite[]>([]);

  // Load all employees once for the filter dropdown
  useEffect(() => {
    (async () => {
      const { data: roles } = await (supabase as any)
        .from("user_roles").select("user_id").in("role", ["employee", "admin"]);
      const userIds = Array.from(new Set(((roles ?? []) as { user_id: string }[]).map((r) => r.user_id)));
      if (userIds.length === 0) { setAllEmployees([]); return; }
      const { data: pr } = await supabase
        .from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      const list = ((pr ?? []) as ProfileLite[]).sort((a, b) =>
        (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")
      );
      setAllEmployees(list);
    })();
  }, []);

  const range = useMemo(() => {
    if (view === "month") {
      return { start: ymd(cursor), end: ymd(addMonths(cursor, 1)) };
    }
    return { start: ymd(weekCursor), end: ymd(addDays(weekCursor, 7)) };
  }, [view, cursor, weekCursor]);

  useEffect(() => {
    (async () => {
      const { data: ev } = await (supabase as any)
        .from("quotes")
        .select("id, reference_number, client_name, event_type, event_date, guest_count, location_name, status")
        .gte("event_date", range.start)
        .lt("event_date", range.end)
        .order("event_date", { ascending: true });
      const eventsData = (ev ?? []) as EventRow[];
      setEvents(eventsData);
      const ids = eventsData.map((e) => e.id);
      if (ids.length === 0) { setAssignments([]); setProfiles({}); return; }
      const { data: asg } = await (supabase as any)
        .from("event_assignments").select("id, quote_id, employee_user_id, role").in("quote_id", ids);
      const asgData = (asg ?? []) as Assignment[];
      setAssignments(asgData);
      const userIds = Array.from(new Set(asgData.map((a) => a.employee_user_id)));
      if (userIds.length > 0) {
        const { data: pr } = await supabase
          .from("profiles").select("user_id, full_name, email").in("user_id", userIds);
        const map: Record<string, ProfileLite> = {};
        for (const p of (pr ?? []) as ProfileLite[]) map[p.user_id] = p;
        setProfiles(map);
      } else {
        setProfiles({});
      }
    })();
  }, [range.start, range.end]);

  // Quote IDs the selected employee is on (for filtering)
  const filteredQuoteIds = useMemo(() => {
    if (employeeFilter === "all") return null;
    return new Set(assignments.filter((a) => a.employee_user_id === employeeFilter).map((a) => a.quote_id));
  }, [employeeFilter, assignments]);

  const visibleEvents = useMemo(() => {
    if (!filteredQuoteIds) return events;
    return events.filter((e) => filteredQuoteIds.has(e.id));
  }, [events, filteredQuoteIds]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    for (const e of visibleEvents) {
      if (!e.event_date) continue;
      (map[e.event_date] ??= []).push(e);
    }
    return map;
  }, [visibleEvents]);

  const assignmentsByQuote = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of assignments) (map[a.quote_id] ??= []).push(a);
    return map;
  }, [assignments]);

  // Month grid (Sunday-start, 42 cells)
  const monthGrid = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = first.getDay();
    const startDate = addDays(first, -lead);
    return Array.from({ length: 42 }, (_, i) => addDays(startDate, i));
  }, [cursor]);

  // Week grid (7 days from weekCursor)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekCursor, i)), [weekCursor]);

  const todayStr = ymd(new Date());

  const headerLabel = view === "month"
    ? cursor.toLocaleString("default", { month: "long", year: "numeric" })
    : `${weekCursor.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(weekCursor, 6).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const goPrev = () => view === "month" ? setCursor((c) => addMonths(c, -1)) : setWeekCursor((c) => addDays(c, -7));
  const goNext = () => view === "month" ? setCursor((c) => addMonths(c, 1)) : setWeekCursor((c) => addDays(c, 7));
  const goToday = () => {
    const now = new Date();
    setCursor(startOfMonth(now));
    setWeekCursor(startOfWeek(now));
    setSelectedDate(todayStr);
  };

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  const renderStaffBadges = (quoteId: string) => {
    const staff = assignmentsByQuote[quoteId] ?? [];
    if (staff.length === 0) return <span className="text-xs text-muted-foreground italic">No staff assigned</span>;
    return staff.map((a) => {
      const profile = profiles[a.employee_user_id];
      const name = profile?.full_name || profile?.email || a.employee_user_id.slice(0, 8);
      return (
        <Badge key={a.id} variant="secondary" className={`text-xs font-normal ${ROLE_COLORS[a.role] || ROLE_COLORS.Other}`}>
          <span className="font-semibold mr-1">{a.role}:</span> {name}
        </Badge>
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev}><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="font-display text-lg sm:text-xl font-semibold min-w-[200px] text-center">{headerLabel}</h2>
          <Button variant="outline" size="icon" onClick={goNext}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1 text-xs font-medium rounded ${view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >Month</button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1 text-xs font-medium rounded ${view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >Week</button>
          </div>
          <Button variant="ghost" size="sm" onClick={goToday} className="gap-1">
            <CalendarDays className="w-4 h-4" /> Today
          </Button>
        </div>
      </div>

      {view === "month" ? (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground border-b pb-2 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.map((d, i) => {
                const ds = ymd(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dayEvents = eventsByDate[ds] ?? [];
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(ds)}
                    className={`min-h-[70px] sm:min-h-[90px] border rounded-md p-1.5 text-left transition-colors flex flex-col ${
                      inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground"
                    } ${isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"} ${isToday ? "border-primary/60" : "border-border"}`}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : ""}`}>{d.getDate()}</span>
                    <div className="mt-1 space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div key={ev.id} className="text-[10px] sm:text-xs truncate bg-primary/10 text-primary px-1 py-0.5 rounded">
                          {ev.client_name || ev.event_type || "Event"}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-4 space-y-2">
            {weekDays.map((d) => {
              const ds = ymd(d);
              const isToday = ds === todayStr;
              const dayEvents = eventsByDate[ds] ?? [];
              return (
                <div key={ds} className={`border rounded-lg overflow-hidden ${isToday ? "border-primary/60" : "border-border"}`}>
                  <div className={`flex items-baseline gap-2 px-3 py-2 ${isToday ? "bg-primary/10" : "bg-muted/40"}`}>
                    <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className={`text-base font-display ${isToday ? "text-primary font-bold" : ""}`}>
                      {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">{dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  {dayEvents.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground italic">No events</p>
                  ) : (
                    <div className="divide-y">
                      {dayEvents.map((ev) => (
                        <div key={ev.id} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <p className="font-semibold text-sm">{ev.client_name || "Unnamed"} — {ev.event_type || "Event"}</p>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location_name || "No venue"}</span>
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ev.guest_count} guests</span>
                                <span className="capitalize">{ev.status}</span>
                              </div>
                            </div>
                            {ev.reference_number && (
                              <Link to="/event/$reference" params={{ reference: ev.reference_number }}>
                                <Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="w-3 h-3" />View</Button>
                              </Link>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">{renderStaffBadges(ev.id)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {view === "month" && selectedDate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-display text-lg font-semibold">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events scheduled.</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold">{ev.client_name || "Unnamed"} — {ev.event_type || "Event"}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location_name || "No venue"}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ev.guest_count} guests</span>
                          <span className="capitalize">{ev.status}</span>
                        </div>
                      </div>
                      {ev.reference_number && (
                        <Link to="/event/$reference" params={{ reference: ev.reference_number }}>
                          <Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="w-3 h-3" />View</Button>
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">{renderStaffBadges(ev.id)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
