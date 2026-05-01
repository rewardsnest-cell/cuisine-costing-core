import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Tent, ExternalLink, Copy } from "lucide-react";

export const Route = createFileRoute("/admin/sales-hub/show-events")({
  component: ShowEventsPage,
});

const TYPES = ["Wedding", "Corporate", "Catering", "Social"] as const;

type ShowEvent = {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string | null;
  location: string | null;
  booth_size: string | null;
  primary_goal: string | null;
  kiosk_active: boolean;
  notes: string | null;
};

function ShowEventsPage() {
  const [rows, setRows] = useState<ShowEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    event_name: "",
    event_type: "Wedding",
    event_date: "",
    location: "",
    booth_size: "5x5",
    primary_goal: "",
  });

  const load = async () => {
    setLoading(true);
    const [evRes, leadsRes] = await Promise.all([
      (supabase as any).from("show_events").select("*").order("event_date", { ascending: false, nullsFirst: false }),
      (supabase as any).from("leads").select("source_event_id").not("source_event_id", "is", null),
    ]);
    if (evRes.error) toast.error(evRes.error.message);
    setRows(evRes.data || []);
    const c: Record<string, number> = {};
    for (const r of leadsRes.data || []) {
      const k = (r as any).source_event_id;
      c[k] = (c[k] || 0) + 1;
    }
    setCounts(c);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.event_name.trim()) return toast.error("Event name required");
    const { error } = await (supabase as any).from("show_events").insert({
      event_name: form.event_name.trim(),
      event_type: form.event_type,
      event_date: form.event_date || null,
      location: form.location || null,
      booth_size: form.booth_size || null,
      primary_goal: form.primary_goal || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Show event created");
    setOpen(false);
    setForm({ event_name: "", event_type: "Wedding", event_date: "", location: "", booth_size: "5x5", primary_goal: "" });
    load();
  };

  const toggleKiosk = async (id: string, kiosk_active: boolean) => {
    const { error } = await (supabase as any).from("show_events").update({ kiosk_active }).eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, kiosk_active } : r)));
  };

  const copyKioskLink = (id: string) => {
    const url = `${window.location.origin}/show/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Kiosk link copied");
  };

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 text-sm flex items-start gap-2">
          <Tent className="w-4 h-4 mt-0.5 text-primary" />
          <p>Shows are <strong>lead sources</strong>, not separate pipelines. Toggle <em>Kiosk Active</em> to expose the iPad capture screen at <code>/show/&lt;event-id&gt;</code>.</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">Show Events</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" />New Show</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create show event</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Event name</Label><Input value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} placeholder="Aurora Bridal Show — Spring 2026" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Date</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Booth size</Label>
                  <Select value={form.booth_size} onValueChange={(v) => setForm({ ...form, booth_size: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5x5">5×5</SelectItem>
                      <SelectItem value="10x10">10×10</SelectItem>
                      <SelectItem value="10x20">10×20</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Primary goal</Label><Input value={form.primary_goal} onChange={(e) => setForm({ ...form, primary_goal: e.target.value })} placeholder="50 leads, 8 tastings" /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No show events yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((e) => (
                <li key={e.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{e.event_name}</p>
                      <Badge variant="outline">{e.event_type}</Badge>
                      {e.booth_size && <Badge variant="secondary">{e.booth_size}</Badge>}
                      {e.kiosk_active && <Badge className="bg-emerald-600 hover:bg-emerald-600">KIOSK LIVE</Badge>}
                      <Badge variant="outline" className="text-[10px]">{counts[e.id] || 0} leads</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.event_date ? new Date(e.event_date).toLocaleDateString() : "no date"} · {e.location || "no location"}
                      {e.primary_goal ? ` · goal: ${e.primary_goal}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={e.kiosk_active} onCheckedChange={(v) => toggleKiosk(e.id, v)} id={`k-${e.id}`} />
                      <Label htmlFor={`k-${e.id}`} className="text-xs">Kiosk</Label>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => copyKioskLink(e.id)}>
                      <Copy className="h-3.5 w-3.5" />Link
                    </Button>
                    <Link to="/show/$eventId" params={{ eventId: e.id }} target="_blank">
                      <Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="h-3.5 w-3.5" />Open</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
