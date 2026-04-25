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
import { ArrowRight, CalendarPlus } from "lucide-react";
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
  const [prospects, setProspects] = useState<Array<{ id: string; business_name: string; city: string; status: string }>>([]);
  const [logProspect, setLogProspect] = useState("");
  const [logChannel, setLogChannel] = useState("call");
  const [logOutcome, setLogOutcome] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [recent, setRecent] = useState<Array<any>>([]);
  const [bulkDays, setBulkDays] = useState("3");
  const [bulkChannels, setBulkChannels] = useState<Record<string, boolean>>({ call: true, email: true, "walk-in": true });
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const [row, list, recentLogs] = await Promise.all([
      (supabase as any).from("sales_daily_checklist").select("*").eq("user_id", user.id).eq("day", today).maybeSingle(),
      (supabase as any).from("sales_prospects").select("id, business_name, city, status").order("business_name"),
      (supabase as any).from("sales_contact_log").select("*, sales_prospects(id, business_name, status)").gte("contacted_at", `${today}T00:00:00`).order("contacted_at", { ascending: false }),
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

  const setStage = async (prospectId: string, newStage: string) => {
    const { error } = await (supabase as any)
      .from("sales_prospects")
      .update({ status: newStage })
      .eq("id", prospectId);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${newStage}`);
    load();
  };

  const nextStage = (current: string) => {
    const idx = (PROSPECT_STATUSES as readonly string[]).indexOf(current);
    if (idx < 0 || idx >= PROSPECT_STATUSES.length - 1) return null;
    return PROSPECT_STATUSES[idx + 1];
  };

  const eligibleProspectIds = (() => {
    const ids = new Set<string>();
    for (const r of recent) {
      if (!bulkChannels[r.channel]) continue;
      const pid = r.sales_prospects?.id || r.prospect_id;
      if (pid) ids.add(pid);
    }
    return Array.from(ids);
  })();

  const scheduleBulkFollowUps = async () => {
    const ids = eligibleProspectIds;
    if (ids.length === 0) { toast.error("No eligible contacts today"); return; }
    const days = Math.max(1, parseInt(bulkDays, 10) || 3);
    const target = new Date();
    target.setDate(target.getDate() + days);
    const targetISO = target.toISOString().slice(0, 10);
    setBulkBusy(true);
    const { error } = await (supabase as any)
      .from("sales_prospects")
      .update({ next_follow_up: targetISO })
      .in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Scheduled follow-ups for ${ids.length} prospect${ids.length === 1 ? "" : "s"} on ${targetISO}`);
    if (user) {
      await (supabase as any)
        .from("sales_daily_checklist")
        .upsert({ user_id: user.id, day: today, followups_scheduled: true }, { onConflict: "user_id,day" });
    }
    load();
  };

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
              {recent.map((r) => {
                const pid = r.sales_prospects?.id || r.prospect_id;
                const stage = r.sales_prospects?.status || prospects.find((p) => p.id === pid)?.status || "New";
                const next = nextStage(stage);
                return (
                  <li key={r.id} className="py-2.5 text-sm flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.sales_prospects?.business_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.channel} · {r.outcome || "—"} · <Badge variant="outline" className="text-[10px]">{stage}</Badge>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {next && pid && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setStage(pid, next)}>
                          <ArrowRight className="h-3 w-3" /> {next}
                        </Button>
                      )}
                      {pid && (
                        <Select value={stage} onValueChange={(v) => v !== stage && setStage(pid, v)}>
                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PROSPECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.contacted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
