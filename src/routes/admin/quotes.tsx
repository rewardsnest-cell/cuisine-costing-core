import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Users, Trash2, MessageSquare, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/quotes")({
  component: QuotesPage,
});

type TranscriptMsg = { role: string; content: string };
type Quote = {
  id: string;
  client_name: string | null;
  client_email: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  total: number;
  status: string;
  created_at: string;
  conversation: { source?: string; messages?: TranscriptMsg[] } | null;
};

type Employee = {
  user_id: string;
  position: string | null;
  active: boolean;
  profile: { full_name: string | null; email: string | null } | null;
};

type Assignment = {
  id: string;
  quote_id: string;
  employee_user_id: string;
  role: string;
  notes: string | null;
  employee: { full_name: string | null; email: string | null } | null;
};

const ROLES = ["Lead", "Cook", "Server", "Driver", "Other"];

function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pickEmp, setPickEmp] = useState("");
  const [pickRole, setPickRole] = useState("Lead");
  const [pickNotes, setPickNotes] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptQuote, setTranscriptQuote] = useState<Quote | null>(null);

  const loadQuotes = async () => {
    const { data } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (data) setQuotes(data as Quote[]);
  };

  const loadEmployees = async () => {
    const { data } = await (supabase as any)
      .from("employee_profiles")
      .select("user_id, position, active, profile:profiles!inner(full_name, email)")
      .eq("active", true);
    setEmployees((data ?? []) as Employee[]);
  };

  useEffect(() => { loadQuotes(); loadEmployees(); }, []);

  const openAssign = async (q: Quote) => {
    setActiveQuote(q);
    setAssignOpen(true);
    setPickEmp(""); setPickRole("Lead"); setPickNotes("");
    const { data } = await (supabase as any)
      .from("event_assignments")
      .select("id, quote_id, employee_user_id, role, notes, employee:profiles!event_assignments_employee_user_id_fkey(full_name, email)")
      .eq("quote_id", q.id);
    // Fallback: load profiles separately if the FK join shape isn't wired
    if (!data) {
      const { data: a2 } = await (supabase as any)
        .from("event_assignments")
        .select("id, quote_id, employee_user_id, role, notes")
        .eq("quote_id", q.id);
      const ids = (a2 ?? []).map((x: any) => x.employee_user_id);
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      setAssignments(((a2 ?? []) as any[]).map((x) => ({ ...x, employee: map.get(x.employee_user_id) ?? null })));
    } else {
      setAssignments(data as Assignment[]);
    }
  };

  // Re-load assignments without join (more reliable)
  const reloadAssignments = async (quoteId: string) => {
    const { data } = await (supabase as any)
      .from("event_assignments")
      .select("id, quote_id, employee_user_id, role, notes")
      .eq("quote_id", quoteId);
    const ids = (data ?? []).map((x: any) => x.employee_user_id);
    const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
    const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    setAssignments(((data ?? []) as any[]).map((x) => ({ ...x, employee: map.get(x.employee_user_id) ?? null })));
  };

  useEffect(() => {
    if (activeQuote) reloadAssignments(activeQuote.id);
  }, [activeQuote]);

  const addAssignment = async () => {
    if (!activeQuote || !pickEmp) { toast.error("Pick an employee"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("event_assignments").insert({
      quote_id: activeQuote.id,
      employee_user_id: pickEmp,
      role: pickRole,
      notes: pickNotes || null,
      assigned_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Assigned");
    setPickEmp(""); setPickNotes("");
    reloadAssignments(activeQuote.id);
  };

  const removeAssignment = async (id: string) => {
    const { error } = await (supabase as any).from("event_assignments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (activeQuote) reloadAssignments(activeQuote.id);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "won": return "bg-success/10 text-success";
      case "sent": return "bg-gold/20 text-warm";
      case "lost": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {quotes.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No quotes yet. Customer quote submissions will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => (
            <Card key={q.id} className="shadow-warm border-border/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{q.client_name || "Unnamed"}</p>
                  <p className="text-sm text-muted-foreground">{q.event_type || "Event"} · {q.guest_count} guests · {q.event_date || "TBD"}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(q.status)}`}>{q.status}</span>
                <p className="font-display text-lg font-bold">${Number(q.total).toFixed(2)}</p>
                {q.conversation?.messages?.length ? (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { setTranscriptQuote(q); setTranscriptOpen(true); }}>
                    <MessageSquare className="w-3.5 h-3.5" /> Transcript
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="gap-2" onClick={() => openAssign(q)}>
                  <Users className="w-3.5 h-3.5" /> Staff
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Conversation — {transcriptQuote?.client_name || "Quote"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
            {(transcriptQuote?.conversation?.messages ?? []).map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {!transcriptQuote?.conversation?.messages?.length && (
              <p className="text-sm text-muted-foreground text-center py-8">No transcript saved.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTranscriptOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Staff Assignment{activeQuote ? ` — ${activeQuote.client_name || "Event"}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Currently assigned</p>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-2 rounded-md border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.employee?.full_name || a.employee?.email || a.employee_user_id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{a.role}{a.notes ? ` · ${a.notes}` : ""}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeAssignment(a.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Add staff</p>
            <div>
              <Label>Employee</Label>
              <Select value={pickEmp} onValueChange={setPickEmp}>
                <SelectTrigger><SelectValue placeholder="Pick an employee" /></SelectTrigger>
                <SelectContent>
                  {employees.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No active employees. Add one in Employees.</div>}
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.profile?.full_name || e.profile?.email || e.user_id.slice(0, 8)}{e.position ? ` — ${e.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Select value={pickRole} onValueChange={setPickRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={pickNotes} onChange={(e) => setPickNotes(e.target.value)} placeholder="optional" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Close</Button>
            <Button onClick={addAssignment}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
