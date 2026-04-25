import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PROSPECT_STATUSES } from "@/lib/sales-hub/scripts";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sales-hub/daily")({
  component: DailyChecklistPage,
});

const ITEMS = [
  { key: "calls_done", label: "5 phone calls" },
  { key: "emails_done", label: "5 emails" },
  { key: "walkins_done", label: "2 walk-ins" },
  { key: "leads_logged", label: "Leads logged" },
  { key: "followups_scheduled", label: "Follow-ups scheduled" },
  { key: "opportunity_moved", label: "One opportunity moved forward" },
] as const;

function DailyChecklistPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [prospects, setProspects] = useState<Array<{ id: string; business_name: string; city: string }>>([]);
  const [logProspect, setLogProspect] = useState("");
  const [logChannel, setLogChannel] = useState("call");
  const [logOutcome, setLogOutcome] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [recent, setRecent] = useState<Array<any>>([]);

  const load = async () => {
    if (!user) return;
    const [row, list, recentLogs] = await Promise.all([
      (supabase as any).from("sales_daily_checklist").select("*").eq("user_id", user.id).eq("day", today).maybeSingle(),
      (supabase as any).from("sales_prospects").select("id, business_name, city").order("business_name"),
      (supabase as any).from("sales_contact_log").select("*, sales_prospects(business_name)").gte("contacted_at", `${today}T00:00:00`).order("contacted_at", { ascending: false }),
    ]);
    setState(row?.data || {});
    setProspects(list?.data || []);
    setRecent(recentLogs?.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const toggle = async (key: string, value: boolean) => {
    if (!user) return;
    setState((s) => ({ ...s, [key]: value }));
    const payload = { user_id: user.id, day: today, [key]: value };
    const { error } = await (supabase as any)
      .from("sales_daily_checklist")
      .upsert(payload, { onConflict: "user_id,day" });
    if (error) toast.error(error.message);
  };

  const logContact = async () => {
    if (!logProspect) { toast.error("Pick a prospect"); return; }
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("sales_contact_log").insert({
      prospect_id: logProspect, channel: logChannel, outcome: logOutcome || null, notes: logNotes || null, contacted_at: now, contacted_by: user?.id,
    });
    if (error) return toast.error(error.message);
    await (supabase as any).from("sales_prospects").update({ last_contacted: now }).eq("id", logProspect);
    setLogOutcome(""); setLogNotes("");
    toast.success("Contact logged");
    load();
  };

  const completed = ITEMS.filter((i) => state[i.key]).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Today — {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
              <p className="text-xs text-muted-foreground">{completed} of {ITEMS.length} complete</p>
            </div>
          </div>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {ITEMS.map((i) => (
                <li key={i.key} className="flex items-center gap-3 px-3 py-2.5 rounded border bg-card">
                  <Checkbox checked={!!state[i.key]} onCheckedChange={(v) => toggle(i.key, !!v)} id={i.key} />
                  <label htmlFor={i.key} className={`text-sm flex-1 cursor-pointer ${state[i.key] ? "line-through text-muted-foreground" : ""}`}>{i.label}</label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Log a contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Prospect</Label>
              <Select value={logProspect} onValueChange={setLogProspect}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {prospects.map((p) => <SelectItem key={p.id} value={p.id}>{p.business_name} · {p.city}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={logChannel} onValueChange={setLogChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="walk-in">Walk-in</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Outcome (optional)</Label><Input value={logOutcome} onChange={(e) => setLogOutcome(e.target.value)} placeholder="e.g. Left voicemail, sent menu, booked tasting" /></div>
          <div><Label>Notes (optional)</Label><Textarea rows={2} value={logNotes} onChange={(e) => setLogNotes(e.target.value)} /></div>
          <Button onClick={logContact}>Log contact</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold mb-3">Today's logged contacts</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet today.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="py-2 text-sm flex items-center justify-between">
                  <div>
                    <p className="font-medium">{r.sales_prospects?.business_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{r.channel} · {r.outcome || "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.contacted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
