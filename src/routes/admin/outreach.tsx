import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Mail, MapPin, MessageSquare, Clock, CheckCircle2, RefreshCw, ChevronRight, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach Queue — Admin" },
      { name: "description", content: "Daily outreach tasks generated from due follow-ups." },
    ],
  }),
  component: OutreachPage,
});

type TaskRow = {
  id: string;
  lead_id: string;
  due_date: string;
  status: string;
  priority: string;
  suggested_channel: string | null;
  notes: string | null;
  leads: {
    id: string;
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    address_city: string | null;
    status: string;
    last_outreach_date: string | null;
    last_channel: string | null;
    notes: string | null;
  } | null;
};

const CHANNELS = [
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "walk_in", label: "Walk-in", icon: MapPin },
  { value: "sms", label: "SMS", icon: MessageSquare },
] as const;

const OUTCOMES = [
  { value: "connected", label: "Connected — spoke with contact" },
  { value: "left_message", label: "Left message / voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "follow_up", label: "Wants follow-up later" },
  { value: "booked", label: "Booked / Won" },
  { value: "not_interested", label: "Not interested" },
] as const;

function OutreachPage() {
  const qc = useQueryClient();
  const [logTask, setLogTask] = useState<TaskRow | null>(null);
  const [channel, setChannel] = useState<string>("call");
  const [outcome, setOutcome] = useState<string>("connected");
  const [notes, setNotes] = useState("");

  const { data: tasks, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["outreach-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_tasks")
        .select("id, lead_id, due_date, status, priority, suggested_channel, notes, leads(id, name, company, email, phone, address_city, status, last_outreach_date, last_channel, notes)")
        .eq("status", "pending")
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_outreach_tasks");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`Generated ${count} new tasks`);
      qc.invalidateQueries({ queryKey: ["outreach-tasks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!logTask) throw new Error("No task");
      const { error } = await supabase.rpc("log_lead_contact", {
        p_lead_id: logTask.lead_id,
        p_channel: channel,
        p_outcome: outcome,
        p_notes: notes || null,
        p_task_id: logTask.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact logged");
      setLogTask(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["outreach-tasks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const { error } = await supabase.rpc("snooze_outreach_task", { p_task_id: id, p_days: days });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task snoozed");
      qc.invalidateQueries({ queryKey: ["outreach-tasks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openLogDialog = (task: TaskRow, presetChannel?: string) => {
    setLogTask(task);
    setChannel(presetChannel || task.suggested_channel || "call");
    setOutcome("connected");
    setNotes("");
  };

  if (isLoading) return <LoadingState label="Loading outreach queue…" />;

  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks?.filter((t) => t.due_date < today) ?? [];
  const dueToday = tasks?.filter((t) => t.due_date === today) ?? [];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Outreach Queue</h1>
          <p className="text-muted-foreground mt-1">
            Tasks auto-generated from due follow-ups. Log calls, emails, and walk-ins to update lead status automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Calendar className="h-4 w-4 mr-2" />
            Generate now
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Overdue" value={overdue.length} variant="destructive" />
        <StatCard label="Due today" value={dueToday.length} variant="default" />
        <StatCard label="Total open" value={tasks?.length ?? 0} variant="secondary" />
      </div>

      {tasks?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
            <p className="font-medium">No open outreach tasks.</p>
            <p className="text-sm mt-1">Tasks are generated automatically each morning at 7am.</p>
          </CardContent>
        </Card>
      )}

      {overdue.length > 0 && (
        <TaskGroup title="Overdue" tasks={overdue} onLog={openLogDialog} onSnooze={(id, d) => snoozeMutation.mutate({ id, days: d })} />
      )}
      {dueToday.length > 0 && (
        <TaskGroup title="Due today" tasks={dueToday} onLog={openLogDialog} onSnooze={(id, d) => snoozeMutation.mutate({ id, days: d })} />
      )}

      {/* Log Contact Dialog */}
      <Dialog open={!!logTask} onOpenChange={(open) => !open && setLogTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log contact</DialogTitle>
            <CardDescription>
              {logTask?.leads?.company || logTask?.leads?.name}
            </CardDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Outcome</label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, next steps…" rows={3} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogTask(null)}>Cancel</Button>
            <Button onClick={() => logMutation.mutate()} disabled={logMutation.isPending}>
              {logMutation.isPending ? "Logging…" : "Log & update lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: "default" | "destructive" | "secondary" }) {
  const colors = {
    default: "text-blue-600",
    destructive: "text-red-600",
    secondary: "text-muted-foreground",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`text-3xl font-bold ${colors[variant]}`}>{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function TaskGroup({
  title,
  tasks,
  onLog,
  onSnooze,
}: {
  title: string;
  tasks: TaskRow[];
  onLog: (t: TaskRow, ch?: string) => void;
  onSnooze: (id: string, days: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-4 w-4" />
          {title} <Badge variant="outline">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {tasks.map((t) => {
          const lead = t.leads;
          if (!lead) return null;
          return (
            <div key={t.id} className="py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to="/admin/leads/$id" params={{ id: lead.id }} className="font-medium hover:underline">
                    {lead.company || lead.name || "Untitled"}
                  </Link>
                  <Badge variant={t.priority === "high" ? "destructive" : t.priority === "medium" ? "default" : "secondary"} className="capitalize text-xs">
                    {t.priority}
                  </Badge>
                  <Badge variant="outline" className="capitalize text-xs">{lead.status?.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-muted-foreground">Due {t.due_date}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                  {lead.email && <span>{lead.email}</span>}
                  {lead.phone && <span>{lead.phone}</span>}
                  {lead.address_city && <span>{lead.address_city}</span>}
                  {lead.last_outreach_date && (
                    <span className="text-xs">Last: {lead.last_channel} on {lead.last_outreach_date}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {CHANNELS.map((c) => (
                  <Button key={c.value} variant="outline" size="sm" onClick={() => onLog(t, c.value)} title={`Log ${c.label}`}>
                    <c.icon className="h-3.5 w-3.5" />
                  </Button>
                ))}
                <Select onValueChange={(v) => onSnooze(t.id, Number(v))}>
                  <SelectTrigger className="w-[90px] h-9 text-xs"><SelectValue placeholder="Snooze" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">1 week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
