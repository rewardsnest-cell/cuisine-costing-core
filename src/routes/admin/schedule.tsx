import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, MapPin, Users, ExternalLink, CalendarDays } from "lucide-react";

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

const ROLE_COLORS: Record<string, string> = {
  Lead: "bg-primary/15 text-primary",
  Cook: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Server: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  Driver: "bg-green-500/15 text-green-700 dark:text-green-400",
  Other: "bg-muted text-muted-foreground",
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function SchedulePage() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<EventRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const start = ymd(cursor);
    const end = ymd(addMonths(cursor, 1));
    (async () => {
      const { data: ev } = await (supabase as any)
        .from("quotes")
        .select("id, reference_number, client_name, event_type, event_date, guest_count, location_name, status")
        .gte("event_date", start)
        .lt("event_date", end)
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
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    for (const e of events) {
      if (!e.event_date) continue;
      (map[e.event_date] ??= []).push(e);
    }
    return map;
  }, [events]);

  const assignmentsByQuote = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of assignments) (map[a.quote_id] ??= []).push(a);
    return map;
  }, [assignments]);

  // Build calendar grid (Sunday-start weeks)
  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = first.getDay();
    const startDate = new Date(first); startDate.setDate(startDate.getDate() - lead);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate); d.setDate(startDate.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  const monthLabel = cursor.toLocaleString("default", { month: "long", year: "numeric" });
  const todayStr = ymd(new Date());

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))}><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="font-display text-xl font-semibold min-w-[180px] text-center">{monthLabel}</h2>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setCursor(startOfMonth(new Date())); setSelectedDate(todayStr); }} className="gap-1">
          <CalendarDays className="w-4 h-4" /> Today
        </Button>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground border-b pb-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
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

      {selectedDate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-display text-lg font-semibold">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events scheduled.</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => {
                  const staff = assignmentsByQuote[ev.id] ?? [];
                  return (
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
                      <div className="flex flex-wrap gap-1.5">
                        {staff.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">No staff assigned</span>
                        ) : (
                          staff.map((a) => {
                            const profile = profiles[a.employee_user_id];
                            const name = profile?.full_name || profile?.email || a.employee_user_id.slice(0, 8);
                            return (
                              <Badge key={a.id} variant="secondary" className={`text-xs font-normal ${ROLE_COLORS[a.role] || ROLE_COLORS.Other}`}>
                                <span className="font-semibold mr-1">{a.role}:</span> {name}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
