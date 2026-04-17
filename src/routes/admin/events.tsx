import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CalendarDays, MapPin, Search, Pencil, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/events")({
  head: () => ({ meta: [{ title: "Events — TasteQuote Admin" }] }),
  component: EventsPage,
});

type Event = {
  id: string;
  reference_number: string | null;
  client_name: string | null;
  client_email: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  location_name: string | null;
  location_address: string | null;
  status: string;
  total: number | null;
  user_id: string | null;
};

function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [lockDays, setLockDays] = useState(7);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState({ location_name: "", location_address: "", event_date: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: ev }, { data: settings }] = await Promise.all([
      (supabase as any).from("quotes").select("*").order("event_date", { ascending: true, nullsFirst: false }),
      (supabase as any).from("app_settings").select("revision_lock_days").eq("id", 1).maybeSingle(),
    ]);
    setEvents((ev ?? []) as Event[]);
    setLockDays(settings?.revision_lock_days ?? 7);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (e: Event) => {
    setEditing(e);
    setForm({
      location_name: e.location_name ?? "",
      location_address: e.location_address ?? "",
      event_date: e.event_date ?? "",
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await (supabase as any).from("quotes").update({
      location_name: form.location_name || null,
      location_address: form.location_address || null,
      event_date: form.event_date || null,
    }).eq("id", editing.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Event updated");
    setEditing(null);
    load();
  };

  const filtered = useMemo(() => events.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (e.client_name || "").toLowerCase().includes(q) ||
      (e.client_email || "").toLowerCase().includes(q) ||
      (e.location_name || "").toLowerCase().includes(q) ||
      (e.reference_number || "").toLowerCase().includes(q) ||
      (e.event_type || "").toLowerCase().includes(q)
    );
  }), [events, search]);

  const isLocked = (date: string | null) => {
    if (!date) return false;
    const event = new Date(date + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(event); cutoff.setDate(cutoff.getDate() - lockDays);
    return today > cutoff;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by client, venue, or reference" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">Revision lock: <strong>{lockDays}</strong> days before event</p>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No events.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const locked = isLocked(e.event_date);
            return (
              <Card key={e.id}>
                <CardContent className="p-4 flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{e.client_name || "Unnamed"} — {e.event_type || "Event"}</p>
                      {locked && <span className="inline-flex items-center gap-1 text-xs text-destructive"><Lock className="w-3 h-3" />Locked</span>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">Ref: {e.reference_number || e.id.slice(0, 8)}</p>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{e.event_date || "TBD"}</span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{e.location_name || "No venue"}</span>
                      <span>{e.guest_count} guests</span>
                      <span>${Number(e.total ?? 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {e.reference_number && (
                      <Link to="/event/$reference" params={{ reference: e.reference_number }}>
                        <Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="w-3.5 h-3.5" />View</Button>
                      </Link>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(e)} className="gap-1"><Pencil className="w-3.5 h-3.5" />Edit</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Venue / Location Name</Label><Input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} /></div>
            <div><Label>Venue Address</Label><Input value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} /></div>
            <div><Label>Event Date</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Admins can edit any event regardless of the revision lock.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
