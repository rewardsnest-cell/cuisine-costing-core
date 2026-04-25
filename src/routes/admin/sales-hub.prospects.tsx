import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Phone, Mail as MailIcon, RotateCcw, Reply, UserSearch, Loader2, Sparkles } from "lucide-react";
import { PROSPECT_CITIES, PROSPECT_TYPES, PROSPECT_STATUSES } from "@/lib/sales-hub/scripts";
import { ProspectEmailDialog } from "@/components/sales-hub/ProspectEmailDialog";
import { GenerateContactDialog } from "@/components/sales-hub/GenerateContactDialog";
import { BulkContactReviewDialog, type BulkReviewItem } from "@/components/sales-hub/BulkContactReviewDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { generateProspectContact } from "@/lib/sales-hub/generate-prospect-contact.functions";

export const Route = createFileRoute("/admin/sales-hub/prospects")({
  component: ProspectsPage,
});

type Prospect = {
  id: string;
  business_name: string;
  city: string;
  type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  last_contacted: string | null;
  next_follow_up: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

const EMPTY: Omit<Prospect, "id"> = {
  business_name: "", city: PROSPECT_CITIES[0], type: PROSPECT_TYPES[0],
  contact_name: "", phone: "", email: "", notes: "", status: "New",
  last_contacted: null, next_follow_up: null,
  last_inbound_at: null, last_outbound_at: null,
};

function ProspectsPage() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<Prospect, "id">>(EMPTY);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogProspect, setEmailDialogProspect] = useState<Prospect | null>(null);
  const [emailDialogIsReply, setEmailDialogIsReply] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogProspect, setContactDialogProspect] = useState<Prospect | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [bulkReviewItems, setBulkReviewItems] = useState<BulkReviewItem[]>([]);
  const generateContact = useServerFn(generateProspectContact);

  const isMissingContact = (p: Prospect) => !p.email && !p.phone;
  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const openEmailDialog = (p: Prospect, isReply: boolean) => {
    setEmailDialogProspect(p);
    setEmailDialogIsReply(isReply);
    setEmailDialogOpen(true);
  };

  const hasUnreadReply = (p: Prospect) =>
    !!p.last_inbound_at && (!p.last_outbound_at || p.last_inbound_at > p.last_outbound_at);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sales_prospects")
      .select("*")
      .order("city", { ascending: true })
      .order("business_name", { ascending: true });
    if (error) toast.error(error.message);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (filterCity !== "all" && r.city !== filterCity) return false;
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search && !r.business_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, filterCity, filterType, filterStatus, search]);

  // Group by city for display
  const grouped = useMemo(() => {
    const g: Record<string, Prospect[]> = {};
    for (const p of filtered) {
      g[p.city] = g[p.city] || [];
      g[p.city].push(p);
    }
    return g;
  }, [filtered]);

  const openNew = () => { setEditing(null); setDraft(EMPTY); setOpen(true); };
  const openEdit = (p: Prospect) => { setEditing(p); setDraft({ ...p }); setOpen(true); };

  const save = async () => {
    if (!draft.business_name.trim()) { toast.error("Business name is required"); return; }
    const payload: any = { ...draft };
    if (!payload.next_follow_up) payload.next_follow_up = null;
    if (editing) {
      const { error } = await (supabase as any).from("sales_prospects").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated");
    } else {
      const { error } = await (supabase as any).from("sales_prospects").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Added");
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this prospect?")) return;
    const { error } = await (supabase as any).from("sales_prospects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const runBulkGenerateContact = async () => {
    const targets = rows.filter((r) => selectedIds.has(r.id) && isMissingContact(r));
    if (targets.length === 0) {
      toast.error("Select prospects missing email and phone first.");
      return;
    }

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length });
    const reviewItems: BulkReviewItem[] = [];
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      const base = {
        id: p.id,
        business_name: p.business_name,
        city: p.city,
        type: p.type,
        original_contact_name: p.contact_name,
        original_email: p.email,
        original_phone: p.phone,
        original_notes: p.notes,
      };
      try {
        const res = await generateContact({
          data: { businessName: p.business_name, city: p.city, type: p.type },
        });
        if (!res.ok) {
          failed++;
          reviewItems.push({
            ...base,
            contact_name: p.contact_name ?? "",
            email: p.email ?? "",
            phone: p.phone ?? "",
            website: "",
            ai_notes: "",
            confidence: null,
            error: res.error,
          });
        } else {
          const c = res.contact;
          reviewItems.push({
            ...base,
            contact_name: c.contact_name ?? p.contact_name ?? "",
            email: c.email ?? p.email ?? "",
            phone: c.phone ?? p.phone ?? "",
            website: c.website ?? "",
            ai_notes: c.notes ?? "",
            confidence: (c.confidence ?? null) as BulkReviewItem["confidence"],
          });
        }
      } catch (e: any) {
        failed++;
        reviewItems.push({
          ...base,
          contact_name: p.contact_name ?? "",
          email: p.email ?? "",
          phone: p.phone ?? "",
          website: "",
          ai_notes: "",
          confidence: null,
          error: e?.message ?? "Failed",
        });
      }
      setBulkProgress({ done: i + 1, total: targets.length });
      // Small delay to avoid hammering the AI gateway rate limit
      await new Promise((r) => setTimeout(r, 400));
    }

    setBulkRunning(false);
    setBulkProgress(null);
    setSelectedIds(new Set());
    setBulkReviewItems(reviewItems);
    setBulkReviewOpen(true);
    if (failed) toast.warning(`${failed} prospect${failed === 1 ? "" : "s"} returned errors — review and retry.`);
  };

  const logContact = async (p: Prospect, channel: string) => {
    const now = new Date().toISOString();
    const { error: logErr } = await (supabase as any).from("sales_contact_log").insert({
      prospect_id: p.id, channel, outcome: "logged", contacted_at: now,
    });
    if (logErr) return toast.error(logErr.message);
    await (supabase as any).from("sales_prospects").update({ last_contacted: now, status: p.status === "New" ? "Contacted" : p.status }).eq("id", p.id);
    toast.success(`Logged ${channel}`);
    load();
  };

  const emailProspect = (p: Prospect) => {
    if (!p.email) {
      toast.error("No email on file. Add one in Edit prospect.");
      return;
    }
    openEmailDialog(p, false);
  };

  const callProspect = async (p: Prospect) => {
    if (!p.phone) {
      toast.error("No phone on file. Add one in Edit prospect.");
      return;
    }
    window.open(`tel:${p.phone.replace(/[^\d+]/g, "")}`, "_self");
    await logContact(p, "call");
  };

  const resetContacted = async (p: Prospect) => {
    if (!confirm(`Reset contact history for ${p.business_name}? This clears Last Contacted and sets status back to New.`)) return;
    const { error } = await (supabase as any)
      .from("sales_prospects")
      .update({ last_contacted: null, status: "New" })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Contact reset");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Search</Label>
            <Input placeholder="Business name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">City</Label>
            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {PROSPECT_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {PROSPECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PROSPECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" /> Add Prospect</Button>
        </CardContent>
      </Card>

      {(() => {
        const missingFiltered = filtered.filter(isMissingContact);
        const selectedMissingCount = missingFiltered.filter((p) => selectedIds.has(p.id)).length;
        const allMissingSelected = missingFiltered.length > 0 && selectedMissingCount === missingFiltered.length;
        return (
          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allMissingSelected}
                  onCheckedChange={(v) => {
                    if (v) setSelectedIds(new Set(missingFiltered.map((p) => p.id)));
                    else setSelectedIds(new Set());
                  }}
                  disabled={missingFiltered.length === 0 || bulkRunning}
                  aria-label="Select all prospects missing contact info"
                />
                <span className="text-muted-foreground">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `Select all missing contact info (${missingFiltered.length})`}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {bulkProgress && (
                  <span className="text-xs text-muted-foreground">
                    {bulkProgress.done} / {bulkProgress.total}
                  </span>
                )}
                {selectedIds.size > 0 && !bulkRunning && (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={runBulkGenerateContact}
                  disabled={bulkRunning || selectedIds.size === 0}
                  className="gap-1.5"
                >
                  {bulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {bulkRunning ? "Generating…" : "Generate contact info for selected"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No prospects yet. Add your first one.</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([city, list]) => (
          <Card key={city}>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-display font-semibold">{city}</h3>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Phone / Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last</TableHead>
                    <TableHead>Next</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => (
                    <TableRow key={p.id} data-state={selectedIds.has(p.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={(v) => toggleSelect(p.id, !!v)}
                          disabled={!isMissingContact(p) || bulkRunning}
                          aria-label={`Select ${p.business_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <button onClick={() => openEdit(p)} className="font-medium text-left hover:underline">
                          {p.business_name}
                        </button>
                        {p.notes && <p className="text-xs text-muted-foreground line-clamp-1">{p.notes}</p>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{p.type}</Badge></TableCell>
                      <TableCell className="text-sm">{p.contact_name || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {p.phone && <div>{p.phone}</div>}
                        {p.email && <div className="text-muted-foreground">{p.email}</div>}
                      </TableCell>
                      <TableCell><Badge>{p.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.last_contacted ? new Date(p.last_contacted).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.next_follow_up ? new Date(p.next_follow_up).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => callProspect(p)} title={p.phone ? `Call ${p.phone}` : "No phone on file"} disabled={!p.phone}>
                            <Phone className="w-4 h-4" />
                          </Button>
                          {!p.email && !p.phone ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              onClick={() => { setContactDialogProspect(p); setContactDialogOpen(true); }}
                              title="Use AI to research likely contact info for this prospect"
                            >
                              <UserSearch className="w-3.5 h-3.5" /> Generate contact
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              onClick={() => emailProspect(p)}
                              title={p.email ? `Pick a template & preview email for ${p.email}` : "No email on file — add one in Edit prospect"}
                              disabled={!p.email}
                            >
                              <MailIcon className="w-3.5 h-3.5" /> Generate email
                            </Button>
                          )}
                          {hasUnreadReply(p) && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 gap-1.5"
                              onClick={() => openEmailDialog(p, true)}
                              title={`New reply received ${new Date(p.last_inbound_at!).toLocaleString()}`}
                            >
                              <Reply className="w-3.5 h-3.5" /> Respond
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => resetContacted(p)} title="Reset contacted" disabled={!p.last_contacted}>
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(p.id)} title="Delete">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit prospect" : "Add prospect"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Business name *</Label>
              <Input value={draft.business_name} onChange={(e) => setDraft({ ...draft, business_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City</Label>
                <Select value={draft.city} onValueChange={(v) => setDraft({ ...draft, city: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact name</Label><Input value={draft.contact_name || ""} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
            </div>
            <div>
              <Label>Next follow-up</Label>
              <Input type="date" value={draft.next_follow_up || ""} onChange={(e) => setDraft({ ...draft, next_follow_up: e.target.value || null })} />
            </div>
            <div><Label>Notes</Label><Textarea rows={3} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspectEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        prospect={emailDialogProspect}
        isReply={emailDialogIsReply}
        onSent={load}
      />

      <GenerateContactDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        prospect={contactDialogProspect}
        onSaved={load}
      />
    </div>
  );
}
