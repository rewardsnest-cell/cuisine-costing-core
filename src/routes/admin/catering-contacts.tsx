import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Mail, Phone, Filter, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/LoadingState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/catering-contacts")({
  head: () => ({
    meta: [
      { title: "Local Catering Contacts — Admin" },
      { name: "description", content: "CRM list and saved views for local catering outreach contacts." },
    ],
  }),
  component: CateringContactsPage,
});

type Contact = {
  id: string;
  organization_name: string;
  organization_type: string | null;
  contact_name: string | null;
  role_department: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_city: string | null;
  address_state: string | null;
  priority: string;
  status: string;
  source: string | null;
  last_channel: string | null;
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
  /** Predicate applied client-side after fetch. */
  filter: (c: Contact, today: string) => boolean;
  /** Default sort comparator. */
  sort?: (a: Contact, b: Contact) => number;
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
    sort: (a, b) => a.organization_name.localeCompare(b.organization_name),
  },
  {
    id: "needs-follow-up",
    label: "Needs Follow-Up",
    description:
      "status IN (contacted, follow-up) AND next_follow_up_date <= today",
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
    description: "status IN (booked, repeat-client)",
    filter: (c) =>
      ["booked", "repeat", "repeat-client", "repeat_client"].includes(
        c.status?.toLowerCase(),
      ),
    sort: (a, b) =>
      (b.last_outreach_date ?? "").localeCompare(a.last_outreach_date ?? ""),
  },
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

function CateringContactsPage() {
  const [activeView, setActiveView] = useState<string>(SAVED_VIEWS[0].id);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-catering-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_catering_contacts")
        .select("*")
        .order("organization_name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  const viewed = useMemo(() => {
    const view = SAVED_VIEWS.find((v) => v.id === activeView)!;
    let rows = (data ?? []).filter((c) => view.filter(c, today));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.organization_name?.toLowerCase().includes(q) ||
          c.contact_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.address_city?.toLowerCase().includes(q),
      );
    }
    if (view.sort) rows = [...rows].sort(view.sort);
    return rows;
  }, [data, activeView, search, today]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of SAVED_VIEWS) {
      map[v.id] = (data ?? []).filter((c) => v.filter(c, today)).length;
    }
    return map;
  }, [data, today]);

  if (isLoading) return <LoadingState message="Loading catering contacts…" />;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Local Catering Contacts</h1>
          <p className="text-muted-foreground mt-1">
            CRM with saved views for outreach prioritization.
          </p>
        </div>
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

      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="grid grid-cols-1 md:grid-cols-3 h-auto">
          {SAVED_VIEWS.map((v) => (
            <TabsTrigger key={v.id} value={v.id} className="flex-col items-start gap-1 py-3 px-4">
              <span className="font-medium">{v.label}</span>
              <span className="text-xs text-muted-foreground">{counts[v.id] ?? 0} contacts</span>
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
                <Input
                  placeholder="Search organization, contact, email, city…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-md"
                />
                <ContactsTable rows={viewed} viewId={v.id} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ContactsTable({ rows, viewId }: { rows: Contact[]; viewId: string }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No contacts match this view.
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
            <TableHead>Organization</TableHead>
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
                <div className="font-medium">{c.organization_name}</div>
                {c.organization_type && (
                  <div className="text-xs text-muted-foreground capitalize">
                    {c.organization_type.replace(/[-_]/g, " ")}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div>{c.contact_name || "—"}</div>
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
                  {c.email && (
                    <Button asChild variant="ghost" size="icon">
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
    </div>
  );
}
