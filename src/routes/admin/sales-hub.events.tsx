import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sales-hub/events")({
  component: EventChecklistPage,
});

const SECTIONS = [
  {
    title: "Pre-Event",
    items: [
      { key: "pre_menu", label: "Menu confirmed" },
      { key: "pre_dietary", label: "Dietary needs confirmed" },
      { key: "pre_staffing", label: "Staffing confirmed" },
      { key: "pre_equipment", label: "Equipment packed" },
    ],
  },
  {
    title: "Day-Of",
    items: [
      { key: "day_arrival", label: "On-time arrival" },
      { key: "day_setup", label: "Calm setup" },
      { key: "day_checkin", label: "Client check-in" },
      { key: "day_breakdown", label: "Clean breakdown" },
    ],
  },
  {
    title: "Post-Event",
    items: [
      { key: "post_thanks", label: "Thank client" },
      { key: "post_invoice", label: "Send invoice" },
      { key: "post_review", label: "Ask for review" },
    ],
  },
] as const;

function EventChecklistPage() {
  const [events, setEvents] = useState<Array<{ id: string; client_name: string | null; event_date: string | null; reference_number: string | null }>>([]);
  const [quoteId, setQuoteId] = useState<string>("");
  const [state, setState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("quotes")
        .select("id, client_name, event_date, reference_number")
        .gte("event_date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
        .order("event_date", { ascending: true });
      setEvents(data || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!quoteId) { setState({}); return; }
    (async () => {
      const { data } = await (supabase as any).from("sales_event_checklist").select("*").eq("quote_id", quoteId).maybeSingle();
      setState(data || {});
    })();
  }, [quoteId]);

  const toggle = async (key: string, value: boolean) => {
    if (!quoteId) return;
    setState((s) => ({ ...s, [key]: value }));
    const { error } = await (supabase as any)
      .from("sales_event_checklist")
      .upsert({ quote_id: quoteId, [key]: value }, { onConflict: "quote_id" });
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-3">
          <div>
            <Label>Event</Label>
            <Select value={quoteId} onValueChange={setQuoteId}>
              <SelectTrigger><SelectValue placeholder={loading ? "Loading…" : "Choose an event…"} /></SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {(e.client_name || "Untitled")} · {e.event_date || "no date"} {e.reference_number ? `· ${e.reference_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Showing events from the last 30 days and upcoming.</p>
          </div>
        </CardContent>
      </Card>

      {quoteId ? (
        SECTIONS.map((sec) => (
          <Card key={sec.title}>
            <CardContent className="p-6">
              <h3 className="font-display font-semibold mb-3">{sec.title}</h3>
              <ul className="space-y-2">
                {sec.items.map((i) => (
                  <li key={i.key} className="flex items-center gap-3 px-3 py-2 rounded border bg-card">
                    <Checkbox id={i.key} checked={!!state[i.key]} onCheckedChange={(v) => toggle(i.key, !!v)} />
                    <label htmlFor={i.key} className={`text-sm flex-1 cursor-pointer ${state[i.key] ? "line-through text-muted-foreground" : ""}`}>{i.label}</label>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Pick an event to start the checklist.</CardContent></Card>
      )}
    </div>
  );
}
