import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, MapPin, Users, ClipboardList } from "lucide-react";

type Filter = "upcoming" | "past" | "all";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export const Route = createFileRoute("/my-events")({
  head: () => ({ meta: [{ title: "My Events — VPS Finest" }] }),
  component: MyEventsPage,
});

type Assignment = {
  id: string;
  role: string;
  notes: string | null;
  quote: {
    id: string;
    reference_number: string | null;
    client_name: string | null;
    event_type: string | null;
    event_date: string | null;
    guest_count: number;
    status: string;
  } | null;
};

function MyEventsPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<Filter>("upcoming");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("event_assignments")
        .select("id, role, notes, quote:quotes(id, reference_number, client_name, event_type, event_date, guest_count, status)")
        .eq("employee_user_id", user.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as Assignment[]);
    })();
  }, [user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center px-4 pt-16">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Sign in to see your assigned events.</p>
            <Link to="/login" className="text-primary font-medium underline">Sign in</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background py-10 px-4 pt-24">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">My Events</h1>
            <p className="text-muted-foreground text-sm mt-1">Events you've been assigned to work.</p>
          </div>
          {(() => {
            const today = startOfToday();
            const upcoming = rows.filter((a) => {
              if (!a.quote?.event_date) return true;
              return new Date(a.quote.event_date) >= today;
            });
            const past = rows.filter((a) => {
              if (!a.quote?.event_date) return false;
              return new Date(a.quote.event_date) < today;
            });
            const filtered = filter === "upcoming" ? upcoming : filter === "past" ? past : rows;
            return (
              <>
                <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
                    <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
                    <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                  </TabsList>
                </Tabs>
                {filtered.length === 0 ? (
                  <Card><CardContent className="p-12 text-center">
                    <ClipboardList className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {filter === "upcoming" ? "No upcoming events." : filter === "past" ? "No past events." : "You have no assigned events yet."}
                    </p>
                  </CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{a.quote?.client_name || "Event"} · {a.quote?.event_type || ""}</p>
                        <p className="text-xs text-muted-foreground">Ref: {a.quote?.reference_number || a.quote?.id.slice(0, 8)}</p>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{a.role}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />{a.quote?.event_date || "TBD"}</span>
                      <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{a.quote?.guest_count} guests</span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />Status: {a.quote?.status}</span>
                    </div>
                    {a.notes && <p className="text-sm bg-muted/50 rounded-md p-2">{a.notes}</p>}
                  </CardContent>
                </Card>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}
