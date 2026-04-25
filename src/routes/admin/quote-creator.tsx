import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, fileTypeLabel } from "@/lib/cqh/extract-text";
import {
  listCqhEvents, createCqhEvent,
  getCqhEvent, addCqhDocument, removeCqhDocument,
  addCqhDish, updateCqhDish, deleteCqhDish, mergeCqhDishes,
  extractDishesFromDocs, generateShoppingList,
  upsertShoppingItem, deleteShoppingItem,
  approveShoppingList, createDraftQuoteFromCqh, updateDraftQuotePricing,
  type CqhEvent, type CqhDish, type CqhDocument, type CqhShoppingList, type CqhShoppingListItem,
} from "@/lib/server-fns/cqh.functions";
import {
  Upload, FileText, Trash2, Sparkles, Lock, RefreshCw, ChefHat,
  CheckCircle2, FilePlus, ArrowRight, ListChecks, ScrollText, History,
  Files, DollarSign, ClipboardList, Plus,
} from "lucide-react";

export const Route = createFileRoute("/admin/quote-creator")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: typeof search.event === "string" ? search.event : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Quote Creator — Menu to Quote (Internal)" },
      { name: "description", content: "Internal tool: turn competitor menu uploads into a draft quote." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QuoteCreatorHub,
});

type DiagEntry = { ts: string; level: "info" | "warn" | "error"; msg: string };

const ACCEPT = ".pdf,.docx,.doc,.xls,.xlsx,.csv,.tsv,.txt,.md,.rtf";
const PROGRESS_STEPS = [
  { key: "input", label: "Input" },
  { key: "shopping_list", label: "Shopping List" },
  { key: "approved", label: "Approved" },
  { key: "draft_quote", label: "Draft Quote" },
];
const STATUS_LABEL: Record<string, string> = {
  input: "Input", shopping_list: "Shopping List", approved: "Approved", draft_quote: "Draft Quote",
};

function ProgressBar({ status }: { status: string }) {
  const idx = PROGRESS_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {PROGRESS_STEPS.map((s, i) => {
        const done = i <= idx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i + 1}
            </div>
            <span className={done ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            {i < PROGRESS_STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

function QuoteCreatorHub() {
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  // Event list + selection
  const [events, setEvents] = useState<CqhEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- Diagnostics & URL sync ----
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [diag, setDiag] = useState<DiagEntry[]>([]);
  const [showDiag, setShowDiag] = useState(false);
  const log = useCallback((msg: string, level: DiagEntry["level"] = "info") => {
    const entry = { ts: new Date().toISOString().slice(11, 19), level, msg };
    setDiag((d) => [...d.slice(-199), entry]);
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[QuoteHub] ${msg}`);
  }, []);
  const hardReload = useCallback(() => {
    log("Hard reload requested — clearing module cache & reloading…", "warn");
    try {
      // Bump a query param to defeat any intermediate caches
      const url = new URL(window.location.href);
      url.searchParams.set("_cb", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }, [log]);

  // New event form
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("");
  const [creating, setCreating] = useState(false);

  // Workspace data for the selected event
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    event: any; documents: CqhDocument[]; dishes: CqhDish[];
    shoppingLists: CqhShoppingList[]; currentList: CqhShoppingList | null;
    items: CqhShoppingListItem[]; auditLog: any[]; quotes: any[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("workflow");
  const [eventQuery, setEventQuery] = useState("");
  const [eventStatusFilter, setEventStatusFilter] = useState<string>("all");

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    log("Fetching events list…");
    try {
      const { events } = await listCqhEvents();
      log(`Loaded ${events.length} event(s).`);
      setEvents(events);
      // Auto-select latest if nothing selected
      setSelectedId((cur) => cur ?? (events[0]?.id ?? null));
    } catch (e: any) {
      log(`listCqhEvents failed: ${e?.message ?? e}`, "error");
      toast.error("Couldn't load events", { description: e.message });
    } finally {
      setEventsLoading(false);
    }
  }, [log]);

  const loadEvent = useCallback(async (id: string) => {
    setLoading(true);
    log(`Fetching event ${id}…`);
    try {
      const res = await getCqhEvent({ data: { id } });
      log(`Event loaded: ${(res as any)?.event?.name ?? "(unnamed)"}`);
      setData(res as any);
    } catch (e: any) {
      log(`getCqhEvent failed: ${e?.message ?? e}`, "error");
      toast.error("Couldn't load event", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [log]);

  // Auth + permission diagnostics
  useEffect(() => {
    if (authLoading) { log("Auth: loading session…"); return; }
    if (!user) { log("Auth: no user signed in.", "warn"); return; }
    log(`Auth: signed in as ${user.email} (admin=${isAdmin})`);
  }, [authLoading, user, isAdmin, log]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Sync ?event=<id> -> selectedId (deep link support)
  useEffect(() => {
    if (search.event && search.event !== selectedId) {
      log(`Deep link: selecting event ${search.event} from URL`);
      setSelectedId(search.event);
    }
  }, [search.event, selectedId, log]);

  // Sync selectedId -> ?event=<id> so the URL is shareable
  useEffect(() => {
    if (selectedId && selectedId !== search.event) {
      navigate({ to: "/admin/quote-creator", search: { event: selectedId }, replace: true });
    }
  }, [selectedId, search.event, navigate]);

  useEffect(() => { if (selectedId) loadEvent(selectedId); else setData(null); }, [selectedId, loadEvent]);

  const reload = useCallback(() => {
    if (selectedId) loadEvent(selectedId);
    loadEvents();
  }, [selectedId, loadEvent, loadEvents]);

  const createEvent = async () => {
    if (!name.trim()) { toast.error("Event name is required"); return; }
    setCreating(true);
    try {
      const { event } = await createCqhEvent({ data: {
        name, event_date: date || null, guest_count: guests ? Number(guests) : null,
      }});
      toast.success("Event created");
      setName(""); setDate(""); setGuests("");
      await loadEvents();
      setSelectedId(event.id);
    } catch (e: any) {
      toast.error("Couldn't create event", { description: e.message });
    } finally {
      setCreating(false);
    }
  };

  // ---- Workspace handlers (only run when an event is selected) ----
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedId) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const path = `${selectedId}/${Date.now()}-${f.name}`;
        const up = await supabase.storage.from("cqh-documents").upload(path, f, { upsert: false });
        if (up.error) throw new Error(up.error.message);
        let extracted = "";
        try { extracted = await extractTextFromFile(f); } catch { /* ignore */ }
        await addCqhDocument({ data: {
          event_id: selectedId, filename: f.name, file_type: fileTypeLabel(f),
          storage_path: path, extracted_text: extracted,
        }});
      }
      toast.success(`${files.length} document(s) uploaded`);
      reload();
    } catch (e: any) {
      toast.error("Upload failed", { description: e.message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeDoc = async (doc: CqhDocument) => {
    if (!(await confirm({ title: "Remove document?", description: doc.filename }))) return;
    try { await removeCqhDocument({ data: { id: doc.id } }); toast.success("Removed"); reload(); }
    catch (e: any) { toast.error("Remove failed", { description: e.message }); }
  };

  const extractDishes = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await extractDishesFromDocs({ data: { event_id: selectedId } });
      if ((res as any).error) toast.error((res as any).error);
      else toast.success(`Added ${res.added} dishes from documents`);
      reload();
    } catch (e: any) { toast.error("Extraction failed", { description: e.message }); }
    finally { setBusy(false); }
  };

  const [newDish, setNewDish] = useState("");
  const addDish = async () => {
    if (!newDish.trim() || !selectedId) return;
    try { await addCqhDish({ data: { event_id: selectedId, name: newDish } }); setNewDish(""); reload(); }
    catch (e: any) { toast.error("Couldn't add dish", { description: e.message }); }
  };

  const toggleMain = async (d: CqhDish) => { await updateCqhDish({ data: { id: d.id, is_main: !d.is_main } }); reload(); };
  const removeDish = async (d: CqhDish) => {
    if (!(await confirm({ title: "Delete dish?", description: d.name }))) return;
    await deleteCqhDish({ data: { id: d.id } }); reload();
  };
  const renameDish = async (d: CqhDish) => {
    const next = window.prompt("Rename dish", d.name);
    if (!next || next.trim() === d.name) return;
    await updateCqhDish({ data: { id: d.id, name: next } }); reload();
  };

  const [selectedDishIds, setSelectedDishIds] = useState<Set<string>>(new Set());
  const toggleDishSelected = (id: string) => {
    setSelectedDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllDishes = () => {
    if (!data) return;
    setSelectedDishIds((prev) =>
      prev.size === data.dishes.length ? new Set() : new Set(data.dishes.map((d) => d.id)),
    );
  };
  const bulkDeleteDishes = async () => {
    const ids = Array.from(selectedDishIds);
    if (ids.length === 0) return;
    if (!(await confirm({ title: `Delete ${ids.length} dish${ids.length === 1 ? "" : "es"}?`, description: "This cannot be undone." }))) return;
    try {
      await Promise.all(ids.map((id) => deleteCqhDish({ data: { id } })));
      toast.success(`Deleted ${ids.length} dish${ids.length === 1 ? "" : "es"}`);
      setSelectedDishIds(new Set());
      reload();
    } catch (e: any) {
      toast.error("Bulk delete failed", { description: e.message });
    }
  };

  const duplicateGroups = useMemo(() => {
    if (!data) return [] as CqhDish[][];
    const map = new Map<string, CqhDish[]>();
    for (const d of data.dishes) {
      const k = d.name.trim().toLowerCase();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    const groups: CqhDish[][] = [];
    for (const arr of map.values()) if (arr.length > 1) groups.push(arr);
    return groups;
  }, [data]);

  const mergeGroup = async (group: CqhDish[]) => {
    const [keep, ...rest] = group;
    if (!(await confirm({ title: `Merge ${group.length} dishes?`, description: `Will keep "${keep.name}" and merge the others.`, destructive: false, confirmText: "Merge" }))) return;
    await mergeCqhDishes({ data: { keep_id: keep.id, merge_ids: rest.map((r) => r.id) } });
    toast.success("Merged"); reload();
  };

  const generate = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await generateShoppingList({ data: { event_id: selectedId } });
      toast.success(`Shopping list generated (${res.item_count} items)`);
      reload();
    } catch (e: any) { toast.error("AI generation failed", { description: e.message }); }
    finally { setBusy(false); }
  };

  const rebuild = async () => {
    if (!selectedId) return;
    if (!(await confirm({ title: "Rebuild Shopping List?", description: "Creates a new revision. The previous draft quote (if any) will be marked superseded after you create a new one.", confirmText: "Rebuild" }))) return;
    setBusy(true);
    try { await generateShoppingList({ data: { event_id: selectedId } }); toast.success("New revision created"); reload(); }
    catch (e: any) { toast.error("Rebuild failed", { description: e.message }); }
    finally { setBusy(false); }
  };

  const totalCost = useMemo(() => {
    if (!data) return 0;
    return data.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  }, [data]);

  const [waste, setWaste] = useState(0.05);
  const [overhead, setOverhead] = useState(0.15);
  const [margin, setMargin] = useState(0.35);
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const quoteGuests = data?.event?.guest_count ?? 50;
  const adjustedCost = totalCost * (1 + waste) * (1 + overhead);
  const total = margin >= 1 ? adjustedCost : adjustedCost / (1 - margin);
  const pricePerPerson = total / Math.max(1, quoteGuests);
  const costPerPerson = adjustedCost / Math.max(1, quoteGuests);
  const mainDishes = data?.dishes?.filter((d) => d.is_main) ?? [];
  const mainDishIds = new Set(mainDishes.map((d) => d.id));
  const mainCost = data?.items?.reduce((s, i) => {
    const alloc = i.per_dish_allocation || {};
    let mainShare = 0;
    for (const did of Object.keys(alloc)) if (mainDishIds.has(did)) mainShare += Number(alloc[did]);
    const unit = Number(i.quantity) || 0;
    if (unit === 0) return s;
    return s + (mainShare / unit) * Number(i.quantity) * Number(i.unit_price);
  }, 0) ?? 0;
  const mainCostPerPerson = mainCost / Math.max(1, quoteGuests);

  const createQuote = async () => {
    if (!data?.currentList || data.currentList.status !== "approved" || !selectedId) {
      toast.error("Approve the shopping list first."); return;
    }
    setBusy(true);
    try {
      const { quote } = await createDraftQuoteFromCqh({ data: {
        event_id: selectedId, shopping_list_id: data.currentList.id,
        guest_count: quoteGuests, waste_pct: waste, overhead_pct: overhead, target_margin_pct: margin,
        client_name: client || null, client_email: clientEmail || null,
      }});
      toast.success(`Draft quote created (${quote.reference_number})`);
      reload();
    } catch (e: any) { toast.error("Quote creation failed", { description: e.message }); }
    finally { setBusy(false); }
  };

  const ev = data?.event;
  const list = data?.currentList ?? null;
  const isApproved = list?.status === "approved";

  // Auth gate — show clear messages instead of a blank page
  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl text-center space-y-4">
        <h1 className="font-display text-2xl font-bold">Sign in required</h1>
        <p className="text-sm text-muted-foreground">You must be signed in as an admin to use the Quote Hub.</p>
        <Button asChild><Link to="/login">Go to login</Link></Button>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl text-center space-y-4">
        <h1 className="font-display text-2xl font-bold">Access denied</h1>
        <p className="text-sm text-muted-foreground">Admin role required for the Competitor Quote Hub.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" /> Competitor Quote Hub
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Upload competitor menus, let AI propose a shopping list, approve it, then generate a draft quote — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDiag((v) => !v)}>
            {showDiag ? "Hide" : "Show"} diagnostics
          </Button>
          <Button variant="outline" size="sm" onClick={hardReload} title="Force-reload bypassing cache">
            <RefreshCw className="w-4 h-4 mr-1" /> Hard reload
          </Button>
        </div>
      </div>

      {showDiag && (
        <Card className="mb-6 border-amber-500/40">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ScrollText className="w-4 h-4" /> Diagnostics
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setDiag([])}>Clear</Button>
          </CardHeader>
          <CardContent>
            <div className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div><span className="text-muted-foreground">Route:</span> /admin/quote-creator</div>
              <div><span className="text-muted-foreground">?event:</span> {search.event ?? "—"}</div>
              <div><span className="text-muted-foreground">selectedId:</span> {selectedId ?? "—"}</div>
              <div><span className="text-muted-foreground">User:</span> {user.email}</div>
              <div><span className="text-muted-foreground">isAdmin:</span> {String(isAdmin)}</div>
              <div><span className="text-muted-foreground">eventsLoading:</span> {String(eventsLoading)}</div>
              <div><span className="text-muted-foreground">eventLoading:</span> {String(loading)}</div>
              <div><span className="text-muted-foreground">events:</span> {events.length}</div>
            </div>
            <div className="bg-muted rounded-md p-2 max-h-60 overflow-auto font-mono text-[11px] leading-relaxed">
              {diag.length === 0 ? (
                <div className="text-muted-foreground">No log entries yet.</div>
              ) : diag.map((e, i) => (
                <div key={i} className={
                  e.level === "error" ? "text-destructive"
                  : e.level === "warn" ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
                }>
                  [{e.ts}] {e.level.toUpperCase()} — {e.msg}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event picker + create */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-[1fr_180px_180px_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Search events</Label>
              <Input
                value={eventQuery}
                onChange={(e) => setEventQuery(e.target.value)}
                placeholder="Search by name or date…"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={eventStatusFilter} onValueChange={setEventStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="input">Input</SelectItem>
                  <SelectItem value="shopping_list">Shopping List</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="draft_quote">Draft Quote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Active event</Label>
              {eventsLoading ? <LoadingState inline /> : (() => {
                const q = eventQuery.trim().toLowerCase();
                const filtered = events.filter((e) => {
                  if (eventStatusFilter !== "all" && e.status !== eventStatusFilter) return false;
                  if (!q) return true;
                  return (
                    e.name.toLowerCase().includes(q) ||
                    (e.event_date ?? "").toLowerCase().includes(q)
                  );
                });
                return (
                  <Select value={selectedId ?? ""} onValueChange={(v) => setSelectedId(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder={
                        events.length === 0 ? "No events yet — create one below"
                        : filtered.length === 0 ? "No matches"
                        : `Select event (${filtered.length})`
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {filtered.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">No events match the filter.</div>
                      ) : filtered.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} {e.event_date ? `· ${e.event_date}` : ""} · {STATUS_LABEL[e.status] ?? e.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
            {ev && <ProgressBar status={ev.status} />}
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New event</p>
            <div className="grid md:grid-cols-[1fr_180px_140px_auto] gap-3 items-end">
              <div>
                <Label className="text-xs">Event name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith Wedding 2025" />
              </div>
              <div>
                <Label className="text-xs">Event date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Guest count</Label>
                <Input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="120" />
              </div>
              <Button onClick={createEvent} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedId ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Select an event above or create a new one to begin.
        </CardContent></Card>
      ) : loading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              {ev.name}
              <span className="text-xs text-muted-foreground font-normal">
                {ev.event_date ?? "No date"} · {ev.guest_count ?? "?"} guests · revision {list?.revision_number ?? "—"}
              </span>
            </h2>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="workflow"><Sparkles className="w-4 h-4 mr-1" /> Workflow</TabsTrigger>
              <TabsTrigger value="summary"><FileText className="w-4 h-4 mr-1" /> Quote Summary</TabsTrigger>
              <TabsTrigger value="shopping"><ListChecks className="w-4 h-4 mr-1" /> Shopping List</TabsTrigger>
              <TabsTrigger value="dishes"><ChefHat className="w-4 h-4 mr-1" /> Dishes & Ingredients</TabsTrigger>
              <TabsTrigger value="pricing"><DollarSign className="w-4 h-4 mr-1" /> Pricing Breakdown</TabsTrigger>
              <TabsTrigger value="docs"><Files className="w-4 h-4 mr-1" /> Source Documents</TabsTrigger>
              <TabsTrigger value="audit"><History className="w-4 h-4 mr-1" /> Audit Trail</TabsTrigger>
            </TabsList>

            <TabsContent value="workflow" className="space-y-4">
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Documents</CardTitle>
                  <div className="flex gap-2">
                    <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => handleUpload(e.target.files)} />
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                      <FilePlus className="w-4 h-4 mr-1" /> Upload
                    </Button>
                    <Button size="sm" onClick={extractDishes} disabled={busy || data.documents.length === 0}>
                      <Sparkles className="w-4 h-4 mr-1" /> Extract dishes
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {data.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Upload PDF, DOCX, XLSX, CSV, TXT, MD, or RTF. Documents are inputs only and never overwrite each other.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {data.documents.map((d) => (
                        <li key={d.id} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{d.filename}</span>
                            <Badge variant="outline" className="text-[10px]">{d.file_type}</Badge>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeDoc(d)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><ChefHat className="w-4 h-4" /> Dish list</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3">
                    <Input value={newDish} onChange={(e) => setNewDish(e.target.value)} placeholder="Add dish manually…" onKeyDown={(e) => e.key === "Enter" && addDish()} />
                    <Button onClick={addDish} variant="outline" size="sm">Add</Button>
                  </div>

                  {duplicateGroups.length > 0 && (
                    <div className="mb-3 p-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                      <p className="text-xs font-semibold text-amber-700 mb-2">Possible duplicates detected — review before generating.</p>
                      <div className="space-y-2">
                        {duplicateGroups.map((g, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{g.map((d) => d.name).join(" / ")} <span className="text-muted-foreground">×{g.length}</span></span>
                            <Button size="sm" variant="outline" onClick={() => mergeGroup(g)}>Merge</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.dishes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No dishes yet.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between py-2 px-1 border-b bg-muted/30 rounded-t-md">
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <Checkbox
                            checked={selectedDishIds.size > 0 && selectedDishIds.size === data.dishes.length}
                            onCheckedChange={toggleAllDishes}
                            aria-label="Select all dishes"
                          />
                          {selectedDishIds.size > 0
                            ? `${selectedDishIds.size} selected`
                            : "Select all"}
                        </label>
                        {selectedDishIds.size > 0 && (
                          <Button size="sm" variant="destructive" onClick={bulkDeleteDishes}>
                            <Trash2 className="w-4 h-4 mr-1" /> Delete {selectedDishIds.size}
                          </Button>
                        )}
                      </div>
                      <ul className="divide-y">
                        {data.dishes.map((d) => (
                          <li key={d.id} className="flex items-center justify-between py-2 gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <Checkbox
                                checked={selectedDishIds.has(d.id)}
                                onCheckedChange={() => toggleDishSelected(d.id)}
                                aria-label={`Select ${d.name}`}
                              />
                              <Switch checked={d.is_main} onCheckedChange={() => toggleMain(d)} aria-label="Main dish" />
                              <span className="text-sm font-medium truncate">{d.name}</span>
                              {d.is_main && <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">MAIN</Badge>}
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => renameDish(d)}>Rename</Button>
                              <Button size="sm" variant="ghost" onClick={() => removeDish(d)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    {!list && (
                      <Button onClick={generate} disabled={busy || data.dishes.length === 0}>
                        <Sparkles className="w-4 h-4 mr-1" /> Create Shopping List
                      </Button>
                    )}
                    {list && !isApproved && (
                      <Button onClick={generate} disabled={busy} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-1" /> Re-generate (replaces draft)
                      </Button>
                    )}
                    {isApproved && (
                      <Button onClick={rebuild} disabled={busy} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-1" /> Rebuild Shopping List
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {list && (
                <ShoppingListEditor list={list} items={data.items} dishes={data.dishes} onChanged={reload} isApproved={isApproved} />
              )}

              {isApproved && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="w-4 h-4" /> Pricing & Draft Quote
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Waste / buffer %</Label>
                        <Input type="number" step="0.01" min={0} max={1} value={waste} onChange={(e) => setWaste(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Overhead %</Label>
                        <Input type="number" step="0.01" min={0} max={1} value={overhead} onChange={(e) => setOverhead(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Target margin %</Label>
                        <Input type="number" step="0.01" min={0} max={0.95} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-4 gap-3 text-sm">
                      <Stat label="Cost / person" value={`$${costPerPerson.toFixed(2)}`} />
                      <Stat label="Main dish / person" value={`$${mainCostPerPerson.toFixed(2)}`} accent="text-primary" />
                      <Stat label="Suggested price / person" value={`$${pricePerPerson.toFixed(2)}`} />
                      <Stat label="Total event price" value={`$${total.toFixed(2)}`} />
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Client name (optional)</Label>
                        <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder={ev.name} />
                      </div>
                      <div>
                        <Label className="text-xs">Client email (optional)</Label>
                        <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={createQuote} disabled={busy}>
                        <FileText className="w-4 h-4 mr-1" /> Create Draft Quote
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.quotes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><ScrollText className="w-4 h-4" /> Quotes for this event</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {data.quotes.map((q) => (
                        <QuoteRow key={q.id} q={q} onChanged={reload} />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="summary">
              <Card>
                <CardHeader><CardTitle className="text-base">Quote Summary</CardTitle></CardHeader>
                <CardContent>
                  {data.quotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No draft quote yet. Approve the shopping list and click "Create Draft Quote".</p>
                  ) : (
                    <ul className="divide-y">
                      {data.quotes.map((q) => (
                        <li key={q.id} className="py-3 grid md:grid-cols-5 gap-3 items-center text-sm">
                          <span className="font-mono text-xs">{q.reference_number}</span>
                          <Badge variant="outline">{q.status}</Badge>
                          <span>{q.guest_count} guests</span>
                          <span className="font-semibold">${Number(q.total).toFixed(2)}</span>
                          {q.superseded_by ? (
                            <Badge variant="outline" className="text-muted-foreground border-muted">Superseded</Badge>
                          ) : (
                            <Link to="/admin/quotes/$id" params={{ id: q.id }}>
                              <Button size="sm" variant="outline">Open</Button>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="shopping">
              {list ? (
                <ShoppingListEditor list={list} items={data.items} dishes={data.dishes} onChanged={reload} isApproved={isApproved} />
              ) : (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Generate a shopping list first.</CardContent></Card>
              )}
            </TabsContent>

            <TabsContent value="dishes">
              <Card>
                <CardHeader><CardTitle className="text-base">Dishes with allocated ingredients</CardTitle></CardHeader>
                <CardContent>
                  {data.dishes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No dishes yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {data.dishes.map((d) => {
                        const dishItems = data.items.filter((i) => (i.per_dish_allocation || {})[d.id]);
                        const dishCost = dishItems.reduce((s, i) => {
                          const alloc = Number((i.per_dish_allocation || {})[d.id] || 0);
                          const total = Number(i.quantity) || 0;
                          if (total === 0) return s;
                          return s + (alloc / total) * total * Number(i.unit_price);
                        }, 0);
                        return (
                          <div key={d.id} className="border rounded-md p-3">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-semibold flex items-center gap-2">
                                {d.name} {d.is_main && <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">MAIN</Badge>}
                              </h4>
                              <span className="text-sm font-mono">${dishCost.toFixed(2)}</span>
                            </div>
                            {dishItems.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No allocated ingredients.</p>
                            ) : (
                              <ul className="text-sm space-y-1">
                                {dishItems.map((i) => (
                                  <li key={i.id} className="flex justify-between">
                                    <span>{i.ingredient_name}</span>
                                    <span className="text-muted-foreground">{(i.per_dish_allocation as any)[d.id]} {i.unit ?? ""}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing">
              <Card>
                <CardHeader><CardTitle className="text-base">Pricing Breakdown</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row k="Raw food cost" v={`$${totalCost.toFixed(2)}`} />
                  <Row k="Waste / buffer" v={`+ ${(waste*100).toFixed(1)}%`} />
                  <Row k="Overhead" v={`+ ${(overhead*100).toFixed(1)}%`} />
                  <Row k="Adjusted cost" v={`$${adjustedCost.toFixed(2)}`} bold />
                  <Row k="Target margin" v={`${(margin*100).toFixed(1)}%`} />
                  <Row k="Suggested total" v={`$${total.toFixed(2)}`} bold />
                  <Row k="Per person" v={`$${pricePerPerson.toFixed(2)}`} />
                  <Row k="Main dish per person" v={`$${mainCostPerPerson.toFixed(2)}`} accent />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="docs">
              <Card><CardContent className="pt-6">
                {data.documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents.</p> : (
                  <ul className="divide-y">
                    {data.documents.map((d) => (
                      <li key={d.id} className="py-2 text-sm flex justify-between">
                        <span>{d.filename}</span>
                        <span className="text-xs text-muted-foreground">{d.file_type} · {d.extracted_text ? `${d.extracted_text.length} chars` : "no text"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="audit">
              <Card><CardContent className="pt-6">
                {data.auditLog.length === 0 ? <p className="text-sm text-muted-foreground">No actions logged yet.</p> : (
                  <ul className="divide-y text-xs font-mono">
                    {data.auditLog.map((a) => (
                      <li key={a.id} className="py-1.5 flex gap-3">
                        <span className="text-muted-foreground w-36 shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                        <span className="font-semibold text-primary w-56 shrink-0">{a.action}</span>
                        <span className="truncate">{JSON.stringify(a.payload || {})}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Row({ k, v, bold, accent }: { k: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "font-semibold border-t pt-2" : ""} ${accent ? "text-primary" : ""}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border rounded-md p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

function QuoteRow({ q, onChanged }: { q: any; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState(String(q.total));
  const [guests, setGuests] = useState(String(q.guest_count));
  const save = async () => {
    try {
      await updateDraftQuotePricing({ data: { quote_id: q.id, total: Number(total), guest_count: Number(guests) } });
      toast.success("Updated"); setEditing(false); onChanged();
    } catch (e: any) { toast.error("Update failed", { description: e.message }); }
  };
  return (
    <li className="py-3 flex items-center gap-3 text-sm flex-wrap">
      <span className="font-mono text-xs w-32">{q.reference_number}</span>
      <Badge variant="outline">{q.status}</Badge>
      {editing ? (
        <>
          <Input className="w-20 h-7" value={guests} onChange={(e) => setGuests(e.target.value)} />
          <Input className="w-28 h-7" value={total} onChange={(e) => setTotal(e.target.value)} />
          <Button size="sm" onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span>{q.guest_count} guests</span>
          <span className="font-semibold">${Number(q.total).toFixed(2)}</span>
          {q.superseded_by ? <Badge variant="outline" className="text-muted-foreground border-muted">Superseded</Badge> : (
            q.status === "draft" && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit pricing</Button>
          )}
          <Link to="/admin/quotes/$id" params={{ id: q.id }} className="ml-auto">
            <Button size="sm" variant="ghost">Open →</Button>
          </Link>
        </>
      )}
    </li>
  );
}

function ShoppingListEditor({ list, items, dishes, onChanged, isApproved }: {
  list: CqhShoppingList; items: CqhShoppingListItem[]; dishes: CqhDish[]; onChanged: () => void; isApproved: boolean;
}) {
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="w-4 h-4" /> Shopping List · Revision {list.revision_number}
          {isApproved ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300"><Lock className="w-3 h-3 mr-1" /> Approved</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
        </CardTitle>
        {!isApproved && (
          <Button size="sm" onClick={async () => {
            try {
              await approveShoppingList({ data: { shopping_list_id: list.id } });
              toast.success("Approved"); onChanged();
            } catch (e: any) { toast.error(e.message); }
          }}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve Shopping List
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-2">Ingredient</th>
                  <th className="py-2 pr-2 w-20">Qty</th>
                  <th className="py-2 pr-2 w-20">Unit</th>
                  <th className="py-2 pr-2 w-24">$ / unit</th>
                  <th className="py-2 pr-2 w-24 text-right">Subtotal</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((i) => (
                  <ItemRow key={i.id} item={i} list={list} isApproved={isApproved} onChanged={onChanged} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td colSpan={4} className="py-2 text-right">Total food cost</td>
                  <td className="text-right">${total.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!isApproved && <AddItemRow list={list} onChanged={onChanged} />}
      </CardContent>
    </Card>
  );
}

function ItemRow({ item, list, isApproved, onChanged }: {
  item: CqhShoppingListItem; list: CqhShoppingList; isApproved: boolean; onChanged: () => void;
}) {
  const [name, setName] = useState(item.ingredient_name);
  const [qty, setQty] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [price, setPrice] = useState(String(item.unit_price));
  const subtotal = (Number(qty) || 0) * (Number(price) || 0);

  const save = async () => {
    try {
      await upsertShoppingItem({ data: {
        id: item.id, shopping_list_id: list.id,
        ingredient_name: name, quantity: Number(qty) || 0, unit: unit || null,
        unit_price: Number(price) || 0,
      }});
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async () => {
    try {
      await deleteShoppingItem({ data: { id: item.id, shopping_list_id: list.id } });
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <tr>
      <td className="py-1 pr-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} disabled={isApproved} className="h-8" />
      </td>
      <td className="py-1 pr-2">
        <Input value={qty} onChange={(e) => setQty(e.target.value)} onBlur={save} disabled={isApproved} className="h-8" />
      </td>
      <td className="py-1 pr-2">
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} onBlur={save} disabled={isApproved} className="h-8" />
      </td>
      <td className="py-1 pr-2">
        <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={save} className="h-8" />
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">${subtotal.toFixed(2)}</td>
      <td className="py-1">
        {!isApproved && (
          <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="w-3.5 h-3.5" /></Button>
        )}
      </td>
    </tr>
  );
}

function AddItemRow({ list, onChanged }: { list: CqhShoppingList; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    try {
      await upsertShoppingItem({ data: {
        shopping_list_id: list.id, ingredient_name: name,
        quantity: Number(qty) || 0, unit: unit || null, unit_price: Number(price) || 0,
      }});
      setName(""); setQty(""); setUnit(""); setPrice("");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="grid grid-cols-[1fr_80px_80px_100px_auto] gap-2 mt-3 pt-3 border-t">
      <Input placeholder="Add ingredient…" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      <Input placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} className="h-8" />
      <Input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-8" />
      <Input placeholder="$/unit" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-8" />
      <Button size="sm" onClick={add}>Add</Button>
    </div>
  );
}
