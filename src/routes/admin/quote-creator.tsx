import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import { ClipboardList, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { listCqhEvents, createCqhEvent, type CqhEvent } from "@/lib/server-fns/cqh.functions";

export const Route = createFileRoute("/admin/quote-creator")({
  head: () => ({
    meta: [
      { title: "Quote Creator — Menu to Quote (Internal)" },
      { name: "description", content: "Internal tool: turn competitor menu uploads into a draft quote." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QuoteCreatorIndex,
});

const STATUS_LABEL: Record<string, string> = {
  input: "Input",
  shopping_list: "Shopping List",
  approved: "Approved",
  draft_quote: "Draft Quote",
};
const STATUS_TONE: Record<string, string> = {
  input: "bg-muted text-muted-foreground",
  shopping_list: "bg-amber-500/15 text-amber-700 border-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  draft_quote: "bg-primary/15 text-primary border-primary/30",
};

function QuoteCreatorIndex() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CqhEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { events } = await listCqhEvents();
      setEvents(events);
    } catch (e: any) {
      toast.error("Couldn't load events", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error("Event name is required"); return; }
    setCreating(true);
    try {
      const { event } = await createCqhEvent({ data: {
        name,
        event_date: date || null,
        guest_count: guests ? Number(guests) : null,
      }});
      toast.success("Event created");
      navigate({ to: "/admin/quote-creator/$id", params: { id: event.id } });
    } catch (e: any) {
      toast.error("Couldn't create event", { description: e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> Quote Creator — Menu to Quote (Internal)
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          One event = one quote-creator workspace. Upload competitor menus, let AI propose
          a shopping list, approve it, then generate a draft quote. Admin-only.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" /> Start a new event
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-[1fr_180px_140px_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Event name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith Wedding 2025" />
          </div>
          <div>
            <Label className="text-xs">Event date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Guest count</Label>
            <Input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="120" />
          </div>
          <Button onClick={create} disabled={creating}>
            {creating ? "Creating…" : "Create event"}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <LoadingState /> : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No events yet. Create one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Guests</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td className="py-2 pr-4 font-medium">{ev.name}</td>
                      <td className="py-2 pr-4">{ev.event_date ?? "—"}</td>
                      <td className="py-2 pr-4">{ev.guest_count ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className={STATUS_TONE[ev.status] ?? "bg-muted"}>
                          {STATUS_LABEL[ev.status] ?? ev.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(ev.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right">
                        <Link to="/admin/quote-creator/$id" params={{ id: ev.id }}>
                          <Button size="sm" variant="outline">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
