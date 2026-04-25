import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import {
  ExternalLink, Mail, Phone, Filter, RefreshCw, ArrowLeft,
  CalendarPlus, MapPin, Building2, X, CalendarIcon, Sparkles,
} from "lucide-react";
import { OutreachDraftDialog, type DraftLead } from "@/components/outreach/OutreachDraftDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/local-catering-contacts")({
  head: () => ({
    meta: [
      { title: "Local Catering Contacts — Admin" },
      { name: "description", content: "Filter local catering contacts by distance, category, priority, status and dates. Quickly schedule follow-ups." },
    ],
  }),
  component: LocalCateringContactsPage,
});

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  organization_type: string | null;
  website: string | null;
  address_city: string | null;
  address_state: string | null;
  distance_miles: number | null;
  priority: string;
  status: string;
  first_outreach_date: string | null;
  last_outreach_date: string | null;
  next_follow_up_date: string | null;
  last_contact_date: string | null;
  catering_use_cases: string[];
  notes: string | null;
  created_at: string;
};

const STATUSES = ["new", "contacted", "follow-up", "qualified", "booked", "repeat", "won", "lost", "not-interested", "archived"];
const PRIORITIES = ["high", "medium", "low"];
const CATEGORIES = [
  "corporate", "education", "healthcare", "nonprofit", "religious",
  "wedding", "social", "government", "hospitality", "other",
];

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  const x = s.toLowerCase();
  if (["booked", "won", "repeat"].includes(x)) return "default";
  if (["lost", "not-interested", "archived"].includes(x)) return "destructive";
  if (["new"].includes(x)) return "secondary";
  return "outline";
}

function priorityVariant(p: string): "default" | "secondary" | "outline" | "destructive" {
  if (p === "high") return "destructive";
  if (p === "medium") return "default";
  return "secondary";
}

function LocalCateringContactsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [maxDistance, setMaxDistance] = useState<string>("");
  const [category, setCategory] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [createdFrom, setCreatedFrom] = useState<Date | undefined>();
  const [createdTo, setCreatedTo] = useState<Date | undefined>();
  const [followUpFrom, setFollowUpFrom] = useState<Date | undefined>();
  const [followUpTo, setFollowUpTo] = useState<Date | undefined>();

  const [scheduleLead, setScheduleLead] = useState<Lead | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(addDays(new Date(), 3));
  const [scheduleNote, setScheduleNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftLead, setDraftLead] = useState<DraftLead | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["local-catering-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,name,email,phone,company,organization_type,website,address_city,address_state,distance_miles,priority,status,first_outreach_date,last_outreach_date,next_follow_up_date,last_contact_date,catering_use_cases,notes,created_at"
        )
        .eq("lead_type", "catering")
        .order("priority", { ascending: true })
        .order("next_follow_up_date", { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const filtered = useMemo(() => {
    const all = data ?? [];
    const term = search.trim().toLowerCase();
    const cf = createdFrom ? format(createdFrom, "yyyy-MM-dd") : null;
    const ct = createdTo ? format(createdTo, "yyyy-MM-dd") : null;
    const ff = followUpFrom ? format(followUpFrom, "yyyy-MM-dd") : null;
    const ft = followUpTo ? format(followUpTo, "yyyy-MM-dd") : null;
    const maxDist = maxDistance ? Number(maxDistance) : null;

    return all.filter((l) => {
      if (term) {
        const hay = [l.name, l.company, l.email, l.phone, l.address_city, l.notes]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (maxDist !== null && !Number.isNaN(maxDist)) {
        if (l.distance_miles == null || Number(l.distance_miles) > maxDist) return false;
      }
      if (category !== "all") {
        const cats = (l.catering_use_cases ?? []).map((c) => c.toLowerCase());
        const orgMatch = (l.organization_type ?? "").toLowerCase() === category;
        if (!cats.includes(category) && !orgMatch) return false;
      }
      if (priority !== "all" && l.priority !== priority) return false;
      if (status !== "all" && l.status !== status) return false;

      const created = (l.created_at ?? "").slice(0, 10);
      if (cf && created < cf) return false;
      if (ct && created > ct) return false;

      if (ff || ft) {
        const fu = l.next_follow_up_date;
        if (!fu) return false;
        if (ff && fu < ff) return false;
        if (ft && fu > ft) return false;
      }
      return true;
    });
  }, [data, search, maxDistance, category, priority, status, createdFrom, createdTo, followUpFrom, followUpTo]);

  const clearFilters = () => {
    setSearch(""); setMaxDistance(""); setCategory("all"); setPriority("all"); setStatus("all");
    setCreatedFrom(undefined); setCreatedTo(undefined); setFollowUpFrom(undefined); setFollowUpTo(undefined);
  };

  const quickSchedule = (lead: Lead, days: number) => {
    setScheduleLead(lead);
    setScheduleDate(addDays(new Date(), days));
    setScheduleNote("");
  };

  const saveFollowUp = async () => {
    if (!scheduleLead || !scheduleDate) return;
    setSaving(true);
    try {
      const dateStr = format(scheduleDate, "yyyy-MM-dd");
      const { error } = await supabase
        .from("leads")
        .update({
          next_follow_up_date: dateStr,
          status: scheduleLead.status === "new" ? "contacted" : scheduleLead.status,
        })
        .eq("id", scheduleLead.id);
      if (error) throw error;

      // Best-effort: log activity if table accepts these columns
      await supabase.from("lead_activity").insert({
        lead_id: scheduleLead.id,
        activity_type: "follow_up_scheduled",
        notes: scheduleNote || `Follow-up scheduled for ${dateStr}`,
      } as never).then(() => {}, () => {});

      toast.success(`Follow-up scheduled for ${format(scheduleDate, "PPP")}`);
      setScheduleLead(null);
      setScheduleNote("");
      refetch();
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to schedule follow-up");
    } finally {
      setSaving(false);
    }
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const overdueCount = filtered.filter(
    (l) => l.next_follow_up_date && l.next_follow_up_date < today
  ).length;
  const dueTodayCount = filtered.filter((l) => l.next_follow_up_date === today).length;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/admin/catering-contacts" className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> All Leads
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Local Catering Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {data?.length ?? 0} contacts • {overdueCount} overdue • {dueTodayCount} due today
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Link to="/admin/outreach">
            <Button size="sm"><CalendarPlus className="h-4 w-4 mr-2" />Outreach Queue</Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Search</Label>
            <Input
              placeholder="Name, company, email, city, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max distance (miles)</Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 25"
              value={maxDistance}
              onChange={(e) => setMaxDistance(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRangePicker label="Created" from={createdFrom} to={createdTo} setFrom={setCreatedFrom} setTo={setCreatedTo} />
          <DateRangePicker label="Next follow-up" from={followUpFrom} to={followUpTo} setFrom={setFollowUpFrom} setTo={setFollowUpTo} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No contacts match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Priority / Status</TableHead>
                    <TableHead>Next follow-up</TableHead>
                    <TableHead className="text-right">Quick actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const isOverdue = l.next_follow_up_date && l.next_follow_up_date < today;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="font-medium">{l.company || l.name || "Untitled"}</div>
                          {l.company && l.name && (
                            <div className="text-xs text-muted-foreground">{l.name}</div>
                          )}
                          <div className="flex flex-wrap gap-2 mt-1">
                            {l.email && (
                              <a href={`mailto:${l.email}`} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                                <Mail className="h-3 w-3" />{l.email}
                              </a>
                            )}
                            {l.phone && (
                              <a href={`tel:${l.phone}`} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                                <Phone className="h-3 w-3" />{l.phone}
                              </a>
                            )}
                            {l.website && (
                              <a href={l.website} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                                <ExternalLink className="h-3 w-3" />site
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {[l.address_city, l.address_state].filter(Boolean).join(", ") || "—"}
                          </div>
                          {l.distance_miles != null && (
                            <div className="text-xs text-muted-foreground">{Number(l.distance_miles).toFixed(1)} mi</div>
                          )}
                          {l.organization_type && (
                            <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                              <Building2 className="h-3 w-3" />{l.organization_type}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={priorityVariant(l.priority)} className="w-fit capitalize">{l.priority}</Badge>
                            <Badge variant={statusVariant(l.status)} className="w-fit">{l.status}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {l.next_follow_up_date ? (
                            <span className={cn("text-sm", isOverdue && "text-destructive font-medium")}>
                              {l.next_follow_up_date}
                              {isOverdue && <span className="ml-1 text-xs">(overdue)</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {l.last_contact_date && (
                            <div className="text-xs text-muted-foreground">last: {l.last_contact_date}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => quickSchedule(l, 1)}>+1d</Button>
                            <Button size="sm" variant="outline" onClick={() => quickSchedule(l, 3)}>+3d</Button>
                            <Button size="sm" variant="outline" onClick={() => quickSchedule(l, 7)}>+1w</Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setDraftLead({
                                id: l.id, name: l.name, company: l.company,
                                organization_type: l.organization_type,
                                catering_use_cases: l.catering_use_cases,
                                email: l.email,
                              })}
                            >
                              <Sparkles className="h-3.5 w-3.5 mr-1" />Draft
                            </Button>
                            <Button size="sm" onClick={() => quickSchedule(l, 3)}>
                              <CalendarPlus className="h-3.5 w-3.5 mr-1" />Schedule
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!scheduleLead} onOpenChange={(o) => !o && setScheduleLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule follow-up</DialogTitle>
          </DialogHeader>
          {scheduleLead && (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-medium">{scheduleLead.company || scheduleLead.name}</div>
                <div className="text-muted-foreground">{scheduleLead.email || scheduleLead.phone}</div>
              </div>
              <div className="space-y-1.5">
                <Label>Follow-up date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduleDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduleDate ? format(scheduleDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Textarea
                  placeholder="What to discuss, next step, etc."
                  value={scheduleNote}
                  onChange={(e) => setScheduleNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleLead(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveFollowUp} disabled={saving || !scheduleDate}>
              {saving ? "Saving…" : "Save follow-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DateRangePicker({
  label, from, to, setFrom, setTo,
}: {
  label: string;
  from: Date | undefined;
  to: Date | undefined;
  setFrom: (d: Date | undefined) => void;
  setTo: (d: Date | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("flex-1 justify-start font-normal", !from && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {from ? format(from, "MMM d") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("flex-1 justify-start font-normal", !to && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {to ? format(to, "MMM d") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={to} onSelect={setTo} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
