import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Flame, Snowflake, Sun, ExternalLink, Tent } from "lucide-react";

export const Route = createFileRoute("/admin/sales-hub/leads")({
  component: LeadsPage,
});

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  priority_level: "HOT" | "WARM" | "COLD";
  source_type: "website" | "show" | "referral" | "outbound" | null;
  source_event_id: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count_band: string | null;
  consent_contact: boolean;
  last_contacted_at: string | null;
  created_at: string;
};

type ShowEvent = { id: string; event_name: string };

const SOURCE_LABEL: Record<string, string> = {
  show: "SHOW",
  website: "WEB",
  referral: "REF",
  outbound: "OUT",
};

function PriorityBadge({ p }: { p: Lead["priority_level"] }) {
  if (p === "HOT") return <Badge className="bg-red-600 hover:bg-red-600 gap-1"><Flame className="h-3 w-3" />HOT</Badge>;
  if (p === "WARM") return <Badge className="bg-amber-500 hover:bg-amber-500 gap-1"><Sun className="h-3 w-3" />WARM</Badge>;
  return <Badge variant="secondary" className="gap-1"><Snowflake className="h-3 w-3" />COLD</Badge>;
}

function LeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [events, setEvents] = useState<Record<string, ShowEvent>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [leadsRes, eventsRes] = await Promise.all([
      (supabase as any)
        .from("leads")
        .select("id, first_name, last_name, name, email, phone, status, priority_level, source_type, source_event_id, event_type, event_date, guest_count_band, consent_contact, last_contacted_at, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      (supabase as any).from("show_events").select("id, event_name"),
    ]);
    if (leadsRes.error) toast.error(leadsRes.error.message);
    setRows(leadsRes.data || []);
    const map: Record<string, ShowEvent> = {};
    for (const e of eventsRes.data || []) map[e.id] = e;
    setEvents(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((l) => {
      if (sourceFilter !== "all" && l.source_type !== sourceFilter) return false;
      if (priorityFilter !== "all" && l.priority_level !== priorityFilter) return false;
      if (eventFilter !== "all" && l.source_event_id !== eventFilter) return false;
      if (!q) return true;
      const hay = [l.first_name, l.last_name, l.name, l.email, l.phone].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, sourceFilter, priorityFilter, eventFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    hot: rows.filter((l) => l.priority_level === "HOT").length,
    show: rows.filter((l) => l.source_type === "show").length,
    last72: rows.filter((l) => l.source_type === "show" && Date.now() - new Date(l.created_at).getTime() < 72 * 3600 * 1000).length,
  }), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total leads" value={stats.total} />
        <StatCard label="HOT" value={stats.hot} accent="text-red-600" />
        <StatCard label="From shows" value={stats.show} />
        <StatCard label="Show leads (72h)" value={stats.last72} accent="text-primary" />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Input placeholder="Search name, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="show">Show</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="HOT">HOT</SelectItem>
              <SelectItem value="WARM">WARM</SelectItem>
              <SelectItem value="COLD">COLD</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Event" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.values(events).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.event_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Link to="/admin/sales-hub/show-events"><Button variant="outline" size="sm" className="gap-2"><Tent className="h-4 w-4" />Manage Shows</Button></Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No leads match these filters.</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((l) => {
                const display = [l.first_name, l.last_name].filter(Boolean).join(" ") || l.name || "(no name)";
                const ev = l.source_event_id ? events[l.source_event_id] : null;
                return (
                  <li key={l.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{display}</p>
                        <PriorityBadge p={l.priority_level} />
                        {l.source_type && (
                          <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[l.source_type] || l.source_type.toUpperCase()}</Badge>
                        )}
                        {ev && (
                          <Badge variant="secondary" className="gap-1 text-[10px]"><Tent className="h-3 w-3" />{ev.event_name}</Badge>
                        )}
                        {l.event_type && <Badge variant="outline" className="text-[10px]">{l.event_type}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {l.email || "—"} · {l.phone || "no phone"} · status: {l.status}
                        {l.guest_count_band ? ` · ${l.guest_count_band} guests` : ""}
                        {l.event_date ? ` · ${new Date(l.event_date).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Link to="/admin/leads/$id" params={{ id: l.id }}>
                      <Button variant="ghost" size="sm" className="gap-1"><ExternalLink className="h-3.5 w-3.5" />Open</Button>
                    </Link>
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

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold font-display ${accent ?? ""}`}>{value}</p>
    </CardContent></Card>
  );
}
