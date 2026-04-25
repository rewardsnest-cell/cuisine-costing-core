import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Mail, Phone, Filter, RefreshCw, ArrowRight, Upload, MapPin, Activity, Send } from "lucide-react";
import { LeadEmailDialog } from "@/components/leads/LeadEmailDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/catering-contacts")({
  head: () => ({
    meta: [
      { title: "Leads — Admin" },
      { name: "description", content: "Unified leads CRM with saved views across all sources." },
    ],
  }),
  component: LeadsPage,
});

type Lead = {
  id: string;
  lead_type: string;
  source: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  organization_type: string | null;
  website: string | null;
  role_department: string | null;
  address_city: string | null;
  address_state: string | null;
  priority: string;
  status: string;
  first_outreach_date: string | null;
  last_outreach_date: string | null;
  next_follow_up_date: string | null;
  catering_use_cases: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SavedView = {
  id: string;
  label: string;
  description: string;
  filter: (c: Lead, today: string) => boolean;
  sort?: (a: Lead, b: Lead) => number;
};

const SAVED_VIEWS: SavedView[] = [
  {
    id: "high-priority-not-contacted",
    label: "High Priority – Not Contacted",
    description: "priority = high AND status = new AND first_outreach_date IS NULL",
    filter: (c) =>
      c.priority?.toLowerCase() === "high" &&
      c.status?.toLowerCase() === "new" &&
      !c.first_outreach_date,
    sort: (a, b) => (a.company ?? a.name ?? "").localeCompare(b.company ?? b.name ?? ""),
  },
  {
    id: "needs-follow-up",
    label: "Needs Follow-Up",
    description: "status IN (contacted, follow-up) AND next_follow_up_date <= today",
    filter: (c, today) =>
      ["contacted", "follow-up", "follow_up"].includes(c.status?.toLowerCase()) &&
      !!c.next_follow_up_date &&
      c.next_follow_up_date <= today,
    sort: (a, b) =>
      (a.next_follow_up_date ?? "").localeCompare(b.next_follow_up_date ?? ""),
  },
  {
    id: "booked-and-repeat",
    label: "Booked & Repeat",
    description: "status IN (booked, repeat)",
    filter: (c) =>
      ["booked", "repeat", "repeat-client", "repeat_client"].includes(c.status?.toLowerCase()),
    sort: (a, b) =>
      (b.last_outreach_date ?? "").localeCompare(a.last_outreach_date ?? ""),
  },
  {
    id: "all",
    label: "All Leads",
    description: "Every lead, regardless of type or status",
    filter: () => true,
    sort: (a, b) => b.created_at.localeCompare(a.created_at),
  },
];

const LEAD_TYPES = [
  { value: "all", label: "All types" },
  { value: "catering", label: "Catering" },
  { value: "contact_form", label: "Contact form" },
  { value: "feedback", label: "Feedback" },
  { value: "quote_request", label: "Quote request" },
  { value: "referral", label: "Referral" },
  { value: "ad_hoc", label: "Ad hoc" },
  { value: "other", label: "Other" },
];

function priorityBadge(priority: string) {
  const p = priority?.toLowerCase();
  const variant: "default" | "secondary" | "destructive" | "outline" =
    p === "high" ? "destructive" : p === "medium" ? "default" : "secondary";
  return <Badge variant={variant} className="capitalize">{priority || "—"}</Badge>;
}

function statusBadge(status: string) {
  return <Badge variant="outline" className="capitalize">{status?.replace(/[-_]/g, " ") || "—"}</Badge>;
}

function typeBadge(type: string) {
  return <Badge variant="secondary" className="capitalize text-xs">{type?.replace(/_/g, " ") || "other"}</Badge>;
}

function LeadsPage() {
  const [activeView, setActiveView] = useState<string>(SAVED_VIEWS[0].id);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  const viewed = useMemo(() => {
    const view = SAVED_VIEWS.find((v) => v.id === activeView)!;
    let rows = (data ?? []).filter((c) => view.filter(c, today));
    if (typeFilter !== "all") {
      rows = rows.filter((c) => c.lead_type === typeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.company?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.address_city?.toLowerCase().includes(q),
      );
    }
    if (view.sort) rows = [...rows].sort(view.sort);
    return rows;
  }, [data, activeView, search, typeFilter, today]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of SAVED_VIEWS) {
      map[v.id] = (data ?? []).filter((c) => v.filter(c, today)).length;
    }
    return map;
  }, [data, today]);

  if (isLoading) return <LoadingState label="Loading leads…" />;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">
            Unified CRM across all lead sources with saved views.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/local-catering-contacts">
              <MapPin className="h-4 w-4 mr-2" />
              Local Contacts
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/outreach">
              <Phone className="h-4 w-4 mr-2" />
              Outreach Queue
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/cron-runs">
              <Activity className="h-4 w-4 mr-2" />
              Cron Runs
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/leads/import">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 h-auto">
          {SAVED_VIEWS.map((v) => (
            <TabsTrigger key={v.id} value={v.id} className="flex-col items-start gap-1 py-3 px-4">
              <span className="font-medium text-left">{v.label}</span>
              <span className="text-xs text-muted-foreground">{counts[v.id] ?? 0} leads</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {SAVED_VIEWS.map((v) => (
          <TabsContent key={v.id} value={v.id} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-4 w-4" />
                  {v.label}
                </CardTitle>
                <CardDescription className="font-mono text-xs">{v.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Search company, name, email, city…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-md"
                  />
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Lead type" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <LeadsTable rows={viewed} viewId={v.id} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function LeadsTable({ rows, viewId }: { rows: Lead[]; viewId: string }) {
  const [composeLead, setComposeLead] = useState<Lead | null>(null);
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No leads match this view.
      </div>
    );
  }

  const showFollowUp = viewId === "needs-follow-up";
  const showLastOutreach = viewId === "booked-and-repeat";

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location</TableHead>
            {showFollowUp && <TableHead>Next Follow-Up</TableHead>}
            {showLastOutreach && <TableHead>Last Outreach</TableHead>}
            <TableHead className="text-right">Reach</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="font-medium">{c.company || c.name || c.email || "—"}</div>
                {c.organization_type && (
                  <div className="text-xs text-muted-foreground capitalize">
                    {c.organization_type.replace(/[-_]/g, " ")}
                  </div>
                )}
              </TableCell>
              <TableCell>{typeBadge(c.lead_type)}</TableCell>
              <TableCell>
                <div>{c.name || "—"}</div>
                {c.role_department && (
                  <div className="text-xs text-muted-foreground">{c.role_department}</div>
                )}
              </TableCell>
              <TableCell>{priorityBadge(c.priority)}</TableCell>
              <TableCell>{statusBadge(c.status)}</TableCell>
              <TableCell>
                {[c.address_city, c.address_state].filter(Boolean).join(", ") || "—"}
              </TableCell>
              {showFollowUp && <TableCell>{c.next_follow_up_date || "—"}</TableCell>}
              {showLastOutreach && <TableCell>{c.last_outreach_date || "—"}</TableCell>}
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild variant="ghost" size="icon" title="Open lead">
                    <Link to="/admin/leads/$id" params={{ id: c.id }}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  {c.email && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Compose from Outlook"
                      onClick={() => setComposeLead(c)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                  {c.email && (
                    <Button asChild variant="ghost" size="icon" title="Open mailto">
                      <a href={`mailto:${c.email}`}><Mail className="h-4 w-4" /></a>
                    </Button>
                  )}
                  {c.phone && (
                    <Button asChild variant="ghost" size="icon">
                      <a href={`tel:${c.phone}`}><Phone className="h-4 w-4" /></a>
                    </Button>
                  )}
                  {c.website && (
                    <Button asChild variant="ghost" size="icon">
                      <a href={c.website} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <LeadEmailDialog
        open={!!composeLead}
        onOpenChange={(o) => !o && setComposeLead(null)}
        lead={composeLead}
      />
    </div>
  );
}
