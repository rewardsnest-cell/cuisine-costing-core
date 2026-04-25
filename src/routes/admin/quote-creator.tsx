import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Upload, Trash2, Sparkles, ListChecks, FileText, Lock, RefreshCw, Plus,
} from "lucide-react";
import { extractTextFromFile, SUPPORTED_DOC_ACCEPT } from "@/lib/cqh/document-to-text";
import {
  cqhCreateEvent, cqhUpdateEvent, cqhAddDocument, cqhRemoveDocument,
  cqhExtractDishes, cqhAddDish, cqhUpdateDish, cqhDeleteDish, cqhMergeDishes,
  cqhGenerateShoppingList, cqhUpsertShoppingItem, cqhDeleteShoppingItem,
  cqhApproveShoppingList, cqhCreateDraftQuote, cqhRebuildShoppingList,
} from "@/lib/server-fns/cqh.functions";

export const Route = createFileRoute("/admin/quote-creator")({
  head: () => ({
    meta: [
      { title: "Quote Creator — Menu to Quote (Internal)" },
      { name: "description", content: "Internal Competitor Quote Hub workspace." },
    ],
  }),
  component: QuoteCreatorPage,
});

type Stage = "input" | "shopping_list" | "approved" | "draft_quote";

function QuoteCreatorPage() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [dishes, setDishes] = useState<any[]>([]);
  const [shoppingList, setShoppingList] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const createEvent = useServerFn(cqhCreateEvent);
  const updateEvent = useServerFn(cqhUpdateEvent);
  const addDoc = useServerFn(cqhAddDocument);
  const removeDoc = useServerFn(cqhRemoveDocument);
  const extractDishes = useServerFn(cqhExtractDishes);
  const addDish = useServerFn(cqhAddDish);
  const updateDish = useServerFn(cqhUpdateDish);
  const deleteDish = useServerFn(cqhDeleteDish);
  const mergeDishes = useServerFn(cqhMergeDishes);
  const generateList = useServerFn(cqhGenerateShoppingList);
  const upsertItem = useServerFn(cqhUpsertShoppingItem);
  const deleteItem = useServerFn(cqhDeleteShoppingItem);
  const approveList = useServerFn(cqhApproveShoppingList);
  const createDraft = useServerFn(cqhCreateDraftQuote);
  const rebuildList = useServerFn(cqhRebuildShoppingList);

  // ---- form for new event ----
  const [evName, setEvName] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evGuests, setEvGuests] = useState<string>("");

  // ---- pricing inputs ----
  const [waste, setWaste] = useState(5);
  const [overhead, setOverhead] = useState(15);
  const [margin, setMargin] = useState(35);

  async function refresh(id: string) {
    const [{ data: ev }, { data: ds }, { data: dishRows }, { data: lists }] = await Promise.all([
      supabase.from("cqh_events").select("*").eq("id", id).maybeSingle(),
      supabase.from("cqh_documents").select("*").eq("event_id", id).order("created_at"),
      supabase.from("cqh_dishes").select("*").eq("event_id", id).order("name"),
      supabase
        .from("cqh_shopping_lists")
        .select("*")
        .eq("event_id", id)
        .order("revision_number", { ascending: false })
        .limit(1),
    ]);
    setEvent(ev);
    setDocs(ds || []);
    setDishes(dishRows || []);
    const sl = lists?.[0] || null;
    setShoppingList(sl);
    if (sl) {
      const { data: itemRows } = await supabase
        .from("cqh_shopping_list_items")
        .select("*")
        .eq("shopping_list_id", sl.id)
        .order("ingredient_name");
      setItems(itemRows || []);
    } else {
      setItems([]);
    }
  }

  useEffect(() => { if (eventId) refresh(eventId); }, [eventId]);

  const stage: Stage = (event?.status as Stage) || "input";
  const totalCost = useMemo(
    () => items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0),
    [items],
  );
  const adjusted = totalCost * (1 + waste / 100) * (1 + overhead / 100);
  const guests = Math.max(1, Number(event?.guest_count) || 1);
  const cpp = adjusted / guests;
  const ppp = cpp / Math.max(0.05, 1 - margin / 100);

  // ---- handlers ----

  async function handleCreateEvent() {
    if (!evName.trim()) return toast.error("Event name required");
    setBusy("create");
    try {
      const res = await createEvent({
        data: {
          name: evName.trim(),
          event_date: evDate || null,
          guest_count: evGuests ? Number(evGuests) : null,
        },
      });
      setEventId((res as any).event.id);
      toast.success("Workspace created");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !eventId) return;
    setBusy("upload");
    try {
      for (const file of Array.from(files)) {
        let text = "";
        try { text = await extractTextFromFile(file); }
        catch (e: any) { toast.error(`${file.name}: ${e.message}`); continue; }
        const path = `${eventId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("cqh-documents").upload(path, file, { upsert: false });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        await addDoc({
          data: {
            event_id: eventId,
            filename: file.name,
            file_type: file.type || file.name.split(".").pop() || "unknown",
            storage_path: path,
            extracted_text: text.slice(0, 1_000_000),
          },
        });
      }
      await refresh(eventId);
      toast.success("Documents uploaded");
    } finally { setBusy(null); }
  }

  async function handleExtractDishes() {
    if (!eventId) return;
    setBusy("dishes");
    try {
      const res: any = await extractDishes({ data: { event_id: eventId } });
      if (res.error) toast.error(res.error);
      else toast.success(`Extracted ${res.count} dish${res.count === 1 ? "" : "es"}`);
      await refresh(eventId);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function handleGenerateList() {
    if (!eventId) return;
    setBusy("ai");
    try {
      const res: any = await generateList({ data: { event_id: eventId } });
      if (res.error) toast.error(res.error);
      else toast.success(`Shopping list ready (${res.item_count} items)`);
      await refresh(eventId);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function handleApprove() {
    if (!shoppingList) return;
    if (!confirm("Approve & lock this shopping list? Structural edits will require a rebuild.")) return;
    setBusy("approve");
    try {
      await approveList({ data: { id: shoppingList.id } });
      toast.success("Shopping list approved");
      await refresh(eventId!);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function handleCreateDraft() {
    if (!shoppingList) return;
    setBusy("draft");
    try {
      const res: any = await createDraft({
        data: {
          shopping_list_id: shoppingList.id,
          waste_pct: waste,
          overhead_pct: overhead,
          target_margin_pct: margin,
        },
      });
      toast.success("Draft quote created");
      await refresh(eventId!);
      window.open(`/admin/quotes`, "_blank");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  async function handleRebuild() {
    if (!eventId) return;
    if (!confirm("Rebuild shopping list? This creates a new revision and supersedes the current draft quote.")) return;
    setBusy("rebuild");
    try {
      await rebuildList({ data: { event_id: eventId } });
      await generateList({ data: { event_id: eventId } });
      toast.success("New revision generated");
      await refresh(eventId);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  // ---- entry screen ----
  if (!eventId) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Quote Creator — Menu to Quote (Internal)</h1>
          <p className="text-muted-foreground mt-2">
            Internal tool for analyzing competitor menus and creating draft quotes. Admin-only.
          </p>
        </div>
        <Card>
          <CardHeader><CardTitle>Start a new event workspace</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Event name *</Label><Input value={evName} onChange={(e) => setEvName(e.target.value)} placeholder="Smith Wedding 2026" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Event date</Label><Input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} /></div>
              <div><Label>Guest count</Label><Input type="number" value={evGuests} onChange={(e) => setEvGuests(e.target.value)} placeholder="120" /></div>
            </div>
            <Button onClick={handleCreateEvent} disabled={busy === "create"} className="w-full">
              {busy === "create" ? "Creating…" : "Create workspace"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- main workspace ----
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{event?.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event?.event_date || "no date"} · {event?.guest_count ?? "?"} guests
          </p>
        </div>
        <Button variant="outline" onClick={() => setEventId(null)}>← New event</Button>
      </div>

      <ProgressBar stage={stage} />

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents"><Upload className="w-4 h-4 mr-1" />Input</TabsTrigger>
          <TabsTrigger value="dishes"><ListChecks className="w-4 h-4 mr-1" />Dishes</TabsTrigger>
          <TabsTrigger value="shopping"><FileText className="w-4 h-4 mr-1" />Shopping List</TabsTrigger>
          <TabsTrigger value="pricing"><Sparkles className="w-4 h-4 mr-1" />Pricing & Quote</TabsTrigger>
        </TabsList>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Upload documents</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input type="file" multiple accept={SUPPORTED_DOC_ACCEPT}
                onChange={(e) => handleUpload(e.target.files)} disabled={busy === "upload"} />
              <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, XLS, CSV, TSV, TXT, MD, RTF</p>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <div className="font-medium">{d.filename}</div>
                      <div className="text-xs text-muted-foreground">{d.file_type}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await removeDoc({ data: { id: d.id } });
                      await refresh(eventId);
                    }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
              </div>
              <Button onClick={handleExtractDishes} disabled={busy === "dishes" || docs.length === 0}>
                <Sparkles className="w-4 h-4 mr-1" />
                {busy === "dishes" ? "Extracting…" : "Extract dishes from documents"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DISHES */}
        <TabsContent value="dishes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dish list ({dishes.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DishAdder onAdd={async (name, isMain) => {
                await addDish({ data: { event_id: eventId, name, is_main: isMain } });
                await refresh(eventId);
              }} />
              <DuplicateGroups dishes={dishes} onMerge={async (keepId, mergeIds, name) => {
                await mergeDishes({ data: { keep_id: keepId, merge_ids: mergeIds, new_name: name } });
                await refresh(eventId);
              }} />
              {dishes.map((d) => (
                <DishRow key={d.id} dish={d}
                  onSave={async (patch) => { await updateDish({ data: { id: d.id, ...patch } }); await refresh(eventId); }}
                  onDelete={async () => { await deleteDish({ data: { id: d.id } }); await refresh(eventId); }}
                />
              ))}
              {dishes.length === 0 && <p className="text-sm text-muted-foreground">No dishes yet — extract from documents or add manually.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SHOPPING LIST */}
        <TabsContent value="shopping" className="space-y-4">
          <div className="flex gap-2 items-center">
            <Button onClick={handleGenerateList} disabled={busy === "ai" || dishes.length === 0}>
              <Sparkles className="w-4 h-4 mr-1" />
              {busy === "ai" ? "Generating…" : shoppingList ? "Regenerate (creates revision)" : "Create Shopping List"}
            </Button>
            {shoppingList && (
              <>
                <Badge variant={shoppingList.status === "approved" ? "default" : "secondary"}>
                  Rev {shoppingList.revision_number} · {shoppingList.status}
                </Badge>
                {shoppingList.status === "draft" && (
                  <Button onClick={handleApprove} disabled={busy === "approve"}>
                    <Lock className="w-4 h-4 mr-1" />Approve & lock
                  </Button>
                )}
                {shoppingList.status === "approved" && (
                  <Button variant="outline" onClick={handleRebuild} disabled={busy === "rebuild"}>
                    <RefreshCw className="w-4 h-4 mr-1" />Rebuild
                  </Button>
                )}
              </>
            )}
          </div>

          {shoppingList && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>By Dish</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {dishes.map((d) => {
                    const dishItems = items.filter((it) => it.dish_id === d.id);
                    const dishCost = dishItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0);
                    return (
                      <div key={d.id} className="border rounded p-2">
                        <div className="flex justify-between font-medium">
                          <span>{d.name}</span>
                          <span className="text-sm">${dishCost.toFixed(2)}</span>
                        </div>
                        <ul className="text-xs text-muted-foreground mt-1 ml-3 list-disc">
                          {dishItems.map((it) => (
                            <li key={it.id}>{it.quantity} {it.unit} {it.ingredient_name} @ ${Number(it.unit_price).toFixed(2)}</li>
                          ))}
                          {dishItems.length === 0 && <li className="list-none italic">No ingredients</li>}
                        </ul>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>Aggregated Shopping List</span>
                    <span className="text-sm font-normal">Total: ${totalCost.toFixed(2)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((it) => (
                    <ShoppingItemRow key={it.id} item={it} locked={shoppingList.status === "approved"}
                      onSave={async (patch) => {
                        await upsertItem({ data: { id: it.id, shopping_list_id: shoppingList.id, ingredient_name: patch.ingredient_name ?? it.ingredient_name, quantity: patch.quantity ?? it.quantity, unit: patch.unit ?? it.unit, unit_price: patch.unit_price ?? it.unit_price, dish_id: it.dish_id } });
                        await refresh(eventId);
                      }}
                      onDelete={async () => { await deleteItem({ data: { id: it.id } }); await refresh(eventId); }}
                    />
                  ))}
                  {shoppingList.status !== "approved" && (
                    <ItemAdder onAdd={async (row) => {
                      await upsertItem({ data: { shopping_list_id: shoppingList.id, ...row } });
                      await refresh(eventId);
                    }} />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* PRICING */}
        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Pricing inputs</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <div><Label>Waste %</Label><Input type="number" value={waste} onChange={(e) => setWaste(Number(e.target.value))} /></div>
              <div><Label>Overhead %</Label><Input type="number" value={overhead} onChange={(e) => setOverhead(Number(e.target.value))} /></div>
              <div><Label>Target margin %</Label><Input type="number" value={margin} onChange={(e) => setMargin(Number(e.target.value))} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Calculated</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Stat label="Raw food cost" value={`$${totalCost.toFixed(2)}`} />
              <Stat label="Adjusted cost" value={`$${adjusted.toFixed(2)}`} />
              <Stat label="Cost / person" value={`$${cpp.toFixed(2)}`} />
              <Stat label="Suggested $ / person" value={`$${ppp.toFixed(2)}`} highlight />
              <Stat label="Total event price" value={`$${(ppp * guests).toFixed(2)}`} highlight />
              <Stat label="Guests" value={String(guests)} />
            </CardContent>
          </Card>
          <Button
            onClick={handleCreateDraft}
            disabled={!shoppingList || shoppingList.status !== "approved" || busy === "draft"}
            size="lg"
          >
            <FileText className="w-4 h-4 mr-1" />
            {busy === "draft" ? "Creating…" : "Create Draft Quote"}
          </Button>
          {shoppingList?.status !== "approved" && (
            <p className="text-sm text-muted-foreground">Approve the shopping list first.</p>
          )}
          <p className="text-sm">
            <Link to="/admin/quotes" className="underline">View all quotes →</Link>
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- subcomponents ----------

function ProgressBar({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: "input", label: "Input" },
    { key: "shopping_list", label: "Shopping List" },
    { key: "approved", label: "Approved" },
    { key: "draft_quote", label: "Draft Quote" },
  ];
  const idx = steps.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <Badge variant={i <= idx ? "default" : "outline"}>{i + 1}. {s.label}</Badge>
          {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded border ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}

function DishAdder({ onAdd }: { onAdd: (name: string, isMain: boolean) => void }) {
  const [name, setName] = useState("");
  const [isMain, setIsMain] = useState(false);
  return (
    <div className="flex gap-2 items-center border rounded p-2 bg-muted/30">
      <Input placeholder="Add dish…" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="text-xs flex items-center gap-1">
        <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} /> main
      </label>
      <Button size="sm" onClick={() => { if (name.trim()) { onAdd(name.trim(), isMain); setName(""); } }}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

function DishRow({ dish, onSave, onDelete }: { dish: any; onSave: (p: any) => void; onDelete: () => void }) {
  const [name, setName] = useState(dish.name);
  return (
    <div className="flex gap-2 items-center border rounded p-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== dish.name && onSave({ name })} />
      <label className="text-xs flex items-center gap-1">
        <input type="checkbox" checked={dish.is_main} onChange={(e) => onSave({ is_main: e.target.checked })} /> main
      </label>
      <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
    </div>
  );
}

function DuplicateGroups({ dishes, onMerge }: { dishes: any[]; onMerge: (keepId: string, mergeIds: string[], name?: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    dishes.forEach((d) => {
      const k = d.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    });
    return Array.from(m.values()).filter((g) => g.length > 1);
  }, [dishes]);
  if (groups.length === 0) return null;
  return (
    <div className="border border-amber-300 rounded p-2 bg-amber-50 dark:bg-amber-950/20 space-y-2">
      <div className="text-sm font-medium">Possible duplicates</div>
      {groups.map((g, i) => (
        <div key={i} className="flex gap-2 items-center text-sm">
          <span>{g.map((d) => d.name).join(" · ")}</span>
          <Button size="sm" variant="outline" onClick={() => onMerge(g[0].id, g.slice(1).map((d) => d.id), g[0].name)}>
            Merge into "{g[0].name}"
          </Button>
        </div>
      ))}
    </div>
  );
}

function ShoppingItemRow({ item, locked, onSave, onDelete }: { item: any; locked: boolean; onSave: (p: any) => void; onDelete: () => void }) {
  const [name, setName] = useState(item.ingredient_name);
  const [qty, setQty] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit || "");
  const [price, setPrice] = useState(String(item.unit_price));
  const blur = () => {
    if (name !== item.ingredient_name || qty !== String(item.quantity) || unit !== (item.unit || "") || price !== String(item.unit_price)) {
      onSave({ ingredient_name: name, quantity: Number(qty), unit, unit_price: Number(price) });
    }
  };
  return (
    <div className="flex gap-1 items-center text-sm">
      <Input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} onBlur={blur} disabled={locked} />
      <Input className="w-16" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={blur} disabled={locked} />
      <Input className="w-16" value={unit} onChange={(e) => setUnit(e.target.value)} onBlur={blur} disabled={locked} placeholder="unit" />
      <Input className="w-20" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={blur} placeholder="$" />
      {!locked && <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="w-3 h-3" /></Button>}
    </div>
  );
}

function ItemAdder({ onAdd }: { onAdd: (row: any) => void }) {
  const [n, setN] = useState(""); const [q, setQ] = useState(""); const [u, setU] = useState(""); const [p, setP] = useState("");
  return (
    <div className="flex gap-1 items-center text-sm border-t pt-2">
      <Input className="flex-1" placeholder="ingredient" value={n} onChange={(e) => setN(e.target.value)} />
      <Input className="w-16" placeholder="qty" value={q} onChange={(e) => setQ(e.target.value)} />
      <Input className="w-16" placeholder="unit" value={u} onChange={(e) => setU(e.target.value)} />
      <Input className="w-20" placeholder="$" value={p} onChange={(e) => setP(e.target.value)} />
      <Button size="sm" onClick={() => {
        if (!n.trim()) return;
        onAdd({ ingredient_name: n, quantity: Number(q) || 0, unit: u, unit_price: Number(p) || 0 });
        setN(""); setQ(""); setU(""); setP("");
      }}><Plus className="w-3 h-3" /></Button>
    </div>
  );
}
