import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CalendarDays, MapPin, Search, Pencil, Lock, ExternalLink, Eye, Users, DollarSign,
  Mail, Phone, User, FileText, Utensils, ClipboardList, Tag, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/events")({
  head: () => ({ meta: [{ title: "Events — TasteQuote Admin" }] }),
  component: EventsPage,
});

type Event = {
  id: string;
  reference_number: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  location_name: string | null;
  location_address: string | null;
  status: string;
  total: number | null;
  subtotal: number | null;
  tax_rate: number | null;
  theoretical_cost: number | null;
  actual_cost: number | null;
  notes: string | null;
  dietary_preferences: any;
  user_id: string | null;
};

type QuoteItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  _new?: boolean;
  _deleted?: boolean;
};

type Assignment = {
  id: string;
  role: string;
  employee_user_id: string;
  notes: string | null;
  profile?: { full_name: string | null; email: string | null } | null;
  _new?: boolean;
  _deleted?: boolean;
};

type Employee = { user_id: string; full_name: string | null; email: string | null };

const STATUS_OPTIONS = ["draft", "pending", "confirmed", "in_progress", "completed", "cancelled"];
const ROLE_OPTIONS = ["Lead", "Cook", "Server", "Driver", "Prep", "Other"];

function fmtMoney(n: number | null | undefined) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed" || status === "completed") return "default";
  if (status === "cancelled") return "destructive";
  if (status === "in_progress") return "secondary";
  return "outline";
}

function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [lockDays, setLockDays] = useState(7);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  const [editing, setEditing] = useState<Event | null>(null);
  const [viewing, setViewing] = useState<Event | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    event_type: "",
    event_date: "",
    guest_count: 1,
    location_name: "",
    location_address: "",
    status: "draft",
    notes: "",
    dietary_preferences: "",
  });
  const [saving, setSaving] = useState(false);

  // New assignment row inputs
  const [newAssignUser, setNewAssignUser] = useState("");
  const [newAssignRole, setNewAssignRole] = useState("Lead");

  const load = async () => {
    const [{ data: ev }, { data: settings }] = await Promise.all([
      (supabase as any).from("quotes").select("*").order("event_date", { ascending: true, nullsFirst: false }),
      (supabase as any).from("app_settings").select("revision_lock_days").eq("id", 1).maybeSingle(),
    ]);
    setEvents((ev ?? []) as Event[]);
    setLockDays(settings?.revision_lock_days ?? 7);
  };

  const loadEmployees = async () => {
    // Get user_ids with employee or admin roles, then their profiles
    const { data: roles } = await (supabase as any)
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["employee", "admin"]);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) { setEmployees([]); return; }
    const { data: profs } = await (supabase as any)
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", ids);
    setEmployees((profs ?? []) as Employee[]);
  };

  useEffect(() => { load(); loadEmployees(); }, []);

  const loadDetails = async (eventId: string) => {
    setDetailsLoading(true);
    const [{ data: it }, { data: as }] = await Promise.all([
      (supabase as any).from("quote_items").select("id, name, quantity, unit_price, total_price").eq("quote_id", eventId),
      (supabase as any).from("event_assignments").select("id, role, employee_user_id, notes").eq("quote_id", eventId),
    ]);
    setItems((it ?? []) as QuoteItem[]);
    const ids = Array.from(new Set(((as ?? []) as Assignment[]).map((a) => a.employee_user_id)));
    let profiles: any[] = [];
    if (ids.length) {
      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      profiles = profs ?? [];
    }
    const enriched = ((as ?? []) as Assignment[]).map((a) => ({
      ...a,
      profile: profiles.find((p) => p.user_id === a.employee_user_id) ?? null,
    }));
    setAssignments(enriched);
    setDetailsLoading(false);
  };

  const openView = async (e: Event) => {
    setViewing(e);
    await loadDetails(e.id);
  };

  const openEdit = async (e: Event) => {
    setEditing(e);
    setForm({
      client_name: e.client_name ?? "",
      client_email: e.client_email ?? "",
      client_phone: e.client_phone ?? "",
      event_type: e.event_type ?? "",
      event_date: e.event_date ?? "",
      guest_count: e.guest_count ?? 1,
      location_name: e.location_name ?? "",
      location_address: e.location_address ?? "",
      status: e.status ?? "draft",
      notes: e.notes ?? "",
      dietary_preferences: Array.isArray(e.dietary_preferences)
        ? (e.dietary_preferences as string[]).join(", ")
        : typeof e.dietary_preferences === "string"
          ? e.dietary_preferences
          : e.dietary_preferences && typeof e.dietary_preferences === "object"
            ? JSON.stringify(e.dietary_preferences)
            : "",
    });
    setNewAssignUser("");
    setNewAssignRole("Lead");
    await loadDetails(e.id);
  };

  // ---------- Menu item editing ----------
  const liveItems = items.filter((i) => !i._deleted);
  const subtotal = liveItems.reduce((s, i) => s + Number(i.total_price || 0), 0);
  const taxRate = editing?.tax_rate ?? 0;
  const total = subtotal * (1 + Number(taxRate || 0));

  const updateItem = (id: string, patch: Partial<QuoteItem>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        const qty = Number(next.quantity) || 0;
        const up = Number(next.unit_price) || 0;
        next.total_price = +(qty * up).toFixed(2);
        return next;
      }),
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: "",
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        _new: true,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.id !== id) return [i];
        if (i._new) return []; // discard unsaved
        return [{ ...i, _deleted: true }];
      }),
    );
  };

  // ---------- Assignment editing ----------
  const liveAssignments = assignments.filter((a) => !a._deleted);

  const addAssignment = () => {
    if (!newAssignUser) { toast.error("Pick an employee"); return; }
    if (liveAssignments.some((a) => a.employee_user_id === newAssignUser && a.role === newAssignRole)) {
      toast.error("That employee is already assigned with this role");
      return;
    }
    const emp = employees.find((e) => e.user_id === newAssignUser);
    setAssignments((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: newAssignRole,
        employee_user_id: newAssignUser,
        notes: null,
        profile: emp ? { full_name: emp.full_name, email: emp.email } : null,
        _new: true,
      },
    ]);
    setNewAssignUser("");
  };

  const removeAssignment = (id: string) => {
    setAssignments((prev) =>
      prev.flatMap((a) => {
        if (a.id !== id) return [a];
        if (a._new) return [];
        return [{ ...a, _deleted: true }];
      }),
    );
  };

  const updateAssignmentRole = (id: string, role: string) => {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, role } : a)));
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const dietaryArr = form.dietary_preferences
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // 1) Persist menu item changes
    const newItems = items.filter((i) => i._new && !i._deleted && (i.name.trim() || i.unit_price > 0));
    const deletedItemIds = items.filter((i) => i._deleted && !i._new).map((i) => i.id);
    const updatedItems = items.filter((i) => !i._new && !i._deleted);

    const itemErrors: string[] = [];

    if (deletedItemIds.length) {
      const { error } = await (supabase as any).from("quote_items").delete().in("id", deletedItemIds);
      if (error) itemErrors.push(`delete items: ${error.message}`);
    }
    for (const it of updatedItems) {
      const { error } = await (supabase as any)
        .from("quote_items")
        .update({
          name: it.name,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0,
        })
        .eq("id", it.id);
      if (error) itemErrors.push(`update ${it.name}: ${error.message}`);
    }
    if (newItems.length) {
      const { error } = await (supabase as any).from("quote_items").insert(
        newItems.map((it) => ({
          quote_id: editing.id,
          name: it.name,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0,
        })),
      );
      if (error) itemErrors.push(`add items: ${error.message}`);
    }

    // 2) Persist assignment changes
    const newAssigns = assignments.filter((a) => a._new && !a._deleted);
    const deletedAssignIds = assignments.filter((a) => a._deleted && !a._new).map((a) => a.id);
    const updatedAssigns = assignments.filter((a) => !a._new && !a._deleted);

    if (deletedAssignIds.length) {
      const { error } = await (supabase as any).from("event_assignments").delete().in("id", deletedAssignIds);
      if (error) itemErrors.push(`delete assignments: ${error.message}`);
    }
    for (const a of updatedAssigns) {
      const { error } = await (supabase as any)
        .from("event_assignments")
        .update({ role: a.role })
        .eq("id", a.id);
      if (error) itemErrors.push(`update assignment: ${error.message}`);
    }
    if (newAssigns.length) {
      const { error } = await (supabase as any).from("event_assignments").insert(
        newAssigns.map((a) => ({
          quote_id: editing.id,
          employee_user_id: a.employee_user_id,
          role: a.role,
        })),
      );
      if (error) itemErrors.push(`add assignments: ${error.message}`);
    }

    // 3) Persist quote (with recomputed subtotal/total)
    const { error } = await (supabase as any).from("quotes").update({
      client_name: form.client_name || null,
      client_email: form.client_email || null,
      client_phone: form.client_phone || null,
      event_type: form.event_type || null,
      event_date: form.event_date || null,
      guest_count: Number(form.guest_count) || 1,
      location_name: form.location_name || null,
      location_address: form.location_address || null,
      status: form.status || "draft",
      notes: form.notes || null,
      dietary_preferences: dietaryArr.length ? dietaryArr : [],
      subtotal: +subtotal.toFixed(2),
      total: +total.toFixed(2),
    }).eq("id", editing.id);

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (itemErrors.length) toast.warning(`Saved with issues: ${itemErrors.join(" · ")}`);
    else toast.success("Event updated");
    setEditing(null);
    load();
  };

  const toggleStatus = (s: string) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return events.filter((e) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const hit =
          (e.client_name || "").toLowerCase().includes(q) ||
          (e.client_email || "").toLowerCase().includes(q) ||
          (e.location_name || "").toLowerCase().includes(q) ||
          (e.reference_number || "").toLowerCase().includes(q) ||
          (e.event_type || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilters.size > 0 && !statusFilters.has(e.status)) return false;
      if (upcomingOnly) {
        if (!e.event_date) return false;
        const d = new Date(e.event_date + "T00:00:00");
        if (d < today) return false;
      }
      return true;
    });
  }, [events, search, statusFilters, upcomingOnly]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) m[e.status] = (m[e.status] || 0) + 1;
    return m;
  }, [events]);

  const isLocked = (date: string | null) => {
    if (!date) return false;
    const event = new Date(date + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(event); cutoff.setDate(cutoff.getDate() - lockDays);
    return today > cutoff;
  };

  const dietaryArrFor = (e: Event): string[] => {
    if (Array.isArray(e.dietary_preferences)) return e.dietary_preferences as string[];
    if (e.dietary_preferences && typeof e.dietary_preferences === "object") {
      return Object.entries(e.dietary_preferences)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
    }
    return [];
  };

  const employeeLabel = (emp: Employee) =>
    emp.full_name || emp.email || emp.user_id.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by client, venue, or reference" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="upcoming-only" checked={upcomingOnly} onCheckedChange={setUpcomingOnly} />
          <Label htmlFor="upcoming-only" className="text-sm cursor-pointer">Upcoming only</Label>
        </div>
        <p className="text-xs text-muted-foreground">Revision lock: <strong>{lockDays}</strong> days before event</p>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setStatusFilters(new Set())}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            statusFilters.size === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
          }`}
        >
          All ({events.length})
        </button>
        {STATUS_OPTIONS.map((s) => {
          const active = statusFilters.has(s);
          const count = statusCounts[s] || 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`text-xs px-3 py-1 rounded-full border capitalize transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              {s.replace("_", " ")} ({count})
            </button>
          );
        })}
        {(statusFilters.size > 0 || upcomingOnly) && (
          <button
            type="button"
            onClick={() => { setStatusFilters(new Set()); setUpcomingOnly(false); }}
            className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No events match the current filters.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const locked = isLocked(e.event_date);
            const dietary = dietaryArrFor(e);
            return (
              <Card key={e.id}>
                <CardContent className="p-4 flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[260px] space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{e.client_name || "Unnamed"} — {e.event_type || "Event"}</p>
                      <Badge variant={statusVariant(e.status)} className="capitalize">{e.status.replace("_", " ")}</Badge>
                      {locked && <span className="inline-flex items-center gap-1 text-xs text-destructive"><Lock className="w-3 h-3" />Locked</span>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">Ref: {e.reference_number || e.id.slice(0, 8)}</p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{e.event_date || "TBD"}</span>
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{e.guest_count} guests</span>
                      <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />{fmtMoney(e.total)}</span>
                      {e.client_email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{e.client_email}</span>}
                      {e.client_phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{e.client_phone}</span>}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{e.location_name || "No venue"}{e.location_address ? ` · ${e.location_address}` : ""}</span>
                    </div>

                    {dietary.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {dietary.map((d) => (
                          <Badge key={d} variant="secondary" className="text-xs gap-1"><Utensils className="w-3 h-3" />{d}</Badge>
                        ))}
                      </div>
                    )}

                    {e.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2"><FileText className="inline w-3 h-3 mr-1" />{e.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Subtotal: {fmtMoney(e.subtotal)}</p>
                      <p>Cost (theo): {fmtMoney(e.theoretical_cost)}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openView(e)} className="gap-1"><Eye className="w-3.5 h-3.5" />Details</Button>
                      {e.reference_number && (
                        <Link to="/event/$reference" params={{ reference: e.reference_number }}>
                          <Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="w-3.5 h-3.5" />Public</Button>
                        </Link>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEdit(e)} className="gap-1"><Pencil className="w-3.5 h-3.5" />Edit</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View / Details Dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {viewing.client_name || "Unnamed"} — {viewing.event_type || "Event"}
                  <Badge variant={statusVariant(viewing.status)} className="capitalize">{viewing.status.replace("_", " ")}</Badge>
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  Ref: {viewing.reference_number || viewing.id.slice(0, 8)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 text-sm">
                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><User className="w-4 h-4" />Client</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
                    <p><span className="font-medium text-foreground">Name:</span> {viewing.client_name || "—"}</p>
                    <p><span className="font-medium text-foreground">Email:</span> {viewing.client_email || "—"}</p>
                    <p><span className="font-medium text-foreground">Phone:</span> {viewing.client_phone || "—"}</p>
                  </div>
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />Event</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
                    <p><span className="font-medium text-foreground">Type:</span> {viewing.event_type || "—"}</p>
                    <p><span className="font-medium text-foreground">Date:</span> {viewing.event_date || "TBD"}</p>
                    <p><span className="font-medium text-foreground">Guests:</span> {viewing.guest_count}</p>
                  </div>
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><MapPin className="w-4 h-4" />Location</h4>
                  <div className="text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">Venue:</span> {viewing.location_name || "—"}</p>
                    <p><span className="font-medium text-foreground">Address:</span> {viewing.location_address || "—"}</p>
                  </div>
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><DollarSign className="w-4 h-4" />Costs & Totals</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
                    <p><span className="font-medium text-foreground">Subtotal:</span> {fmtMoney(viewing.subtotal)}</p>
                    <p><span className="font-medium text-foreground">Tax rate:</span> {((viewing.tax_rate ?? 0) * 100).toFixed(1)}%</p>
                    <p><span className="font-medium text-foreground">Total:</span> {fmtMoney(viewing.total)}</p>
                    <p><span className="font-medium text-foreground">Theo. cost:</span> {fmtMoney(viewing.theoretical_cost)}</p>
                    <p><span className="font-medium text-foreground">Actual cost:</span> {fmtMoney(viewing.actual_cost)}</p>
                  </div>
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" />Menu items</h4>
                  {detailsLoading ? (
                    <p className="text-muted-foreground">Loading…</p>
                  ) : items.length === 0 ? (
                    <p className="text-muted-foreground">No items.</p>
                  ) : (
                    <div className="border rounded-lg divide-y">
                      {items.map((it) => (
                        <div key={it.id} className="p-2 flex items-center justify-between gap-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{it.name}</p>
                            <p className="text-xs text-muted-foreground">Qty {it.quantity} × {fmtMoney(it.unit_price)}</p>
                          </div>
                          <p className="font-mono">{fmtMoney(it.total_price)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><Utensils className="w-4 h-4" />Dietary preferences</h4>
                  {dietaryArrFor(viewing).length === 0 ? (
                    <p className="text-muted-foreground">None recorded.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {dietaryArrFor(viewing).map((d) => (
                        <Badge key={d} variant="secondary" className="gap-1"><Tag className="w-3 h-3" />{d}</Badge>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><Users className="w-4 h-4" />Assigned staff</h4>
                  {detailsLoading ? (
                    <p className="text-muted-foreground">Loading…</p>
                  ) : assignments.length === 0 ? (
                    <p className="text-muted-foreground">No staff assigned.</p>
                  ) : (
                    <div className="space-y-1">
                      {assignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline">{a.role}</Badge>
                          <span>{a.profile?.full_name || a.profile?.email || a.employee_user_id.slice(0, 8)}</span>
                          {a.notes && <span className="text-xs text-muted-foreground">· {a.notes}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="font-semibold mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4" />Notes</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{viewing.notes || "—"}</p>
                </section>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
                <Button onClick={() => { const v = viewing; setViewing(null); openEdit(v); }} className="gap-1">
                  <Pencil className="w-3.5 h-3.5" />Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>Admins can edit any event regardless of the revision lock.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Client */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5"><User className="w-4 h-4" />Client contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label>Name</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} /></div>
              </div>
            </section>

            {/* Event basics */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />Event basics</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2"><Label>Event type</Label><Input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} /></div>
                <div><Label>Event date</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
                <div><Label>Guests</Label><Input type="number" min={1} value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Location */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5"><MapPin className="w-4 h-4" />Location</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Venue name</Label><Input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} /></div>
              </div>
            </section>

            {/* Menu items (editable) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-semibold text-sm flex items-center gap-1.5"><ClipboardList className="w-4 h-4" />Menu items</h4>
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />Add item
                </Button>
              </div>
              {detailsLoading ? (
                <p className="text-xs text-muted-foreground">Loading items…</p>
              ) : liveItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No menu items. Click "Add item" to create one.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_70px_90px_90px_auto] gap-2 text-xs text-muted-foreground px-1">
                    <span>Name</span>
                    <span>Qty</span>
                    <span>Unit price</span>
                    <span className="text-right">Total</span>
                    <span></span>
                  </div>
                  {liveItems.map((it) => (
                    <div key={it.id} className="grid grid-cols-[1fr_70px_90px_90px_auto] gap-2 items-center">
                      <Input
                        value={it.name}
                        placeholder="Item name"
                        onChange={(e) => updateItem(it.id, { name: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={it.quantity}
                        onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={it.unit_price}
                        onChange={(e) => updateItem(it.id, { unit_price: Number(e.target.value) })}
                        className="h-8 text-sm"
                      />
                      <span className="text-right font-mono text-sm">{fmtMoney(it.total_price)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeItem(it.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-0.5">
                <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{fmtMoney(subtotal)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Tax ({((taxRate ?? 0) * 100).toFixed(1)}%)</span><span className="font-mono">{fmtMoney(subtotal * Number(taxRate || 0))}</span></div>
                <div className="flex justify-between font-semibold border-t border-border/60 pt-1 mt-1"><span>Total</span><span className="font-mono">{fmtMoney(total)}</span></div>
              </div>
            </section>

            {/* Assignments (editable) */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5"><Users className="w-4 h-4" />Assigned staff</h4>
              {detailsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : liveAssignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No staff assigned.</p>
              ) : (
                <div className="space-y-2">
                  {liveAssignments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm flex-1 min-w-[140px] truncate">
                        {a.profile?.full_name || a.profile?.email || a.employee_user_id.slice(0, 8)}
                      </span>
                      <Select value={a.role} onValueChange={(v) => updateAssignmentRole(a.id, v)}>
                        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeAssignment(a.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40">
                <Select value={newAssignUser} onValueChange={setNewAssignUser}>
                  <SelectTrigger className="h-8 flex-1 min-w-[180px] text-xs">
                    <SelectValue placeholder={employees.length === 0 ? "No employees available" : "Pick an employee…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>{employeeLabel(emp)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newAssignRole} onValueChange={setNewAssignRole}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addAssignment} disabled={!newAssignUser} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />Assign
                </Button>
              </div>
            </section>

            {/* Notes & dietary */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5"><FileText className="w-4 h-4" />Notes & dietary</h4>
              <div>
                <Label>Dietary preferences <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
                <Input
                  value={form.dietary_preferences}
                  onChange={(e) => setForm({ ...form, dietary_preferences: e.target.value })}
                  placeholder="vegetarian, gluten-free, nut allergy"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
