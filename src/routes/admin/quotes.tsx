import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Users, Trash2, MessageSquare, Eye, Upload, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pdfFileToImageBlobs } from "@/lib/pdf-to-images";
import { compressImageBlob } from "@/lib/compress-image";
import { BulkCompetitorUpload } from "@/components/competitor/BulkCompetitorUpload";

export const Route = createFileRoute("/admin/quotes")({
  component: QuotesPage,
});

type TranscriptMsg = { role: string; content: string };
type AlcoholPrefs = { beer?: string; wine?: string; spirits?: string; signatureCocktail?: string };
type QuotePrefs = {
  proteinDetails?: string; vegetableNotes?: string; cuisineLean?: string;
  spiceLevel?: string; vibe?: string; notes?: string; alcohol?: AlcoholPrefs;
};
type DietaryPrefs = {
  allergies?: string[]; style?: string; proteins?: string[];
  serviceStyle?: string; extras?: string[]; addons?: string[];
  tier?: string; preferences?: QuotePrefs;
};
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
  notes: string | null;
  location_name: string | null;
  location_address: string | null;
  dietary_preferences: DietaryPrefs | null;
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

type CompetitorLineItem = {
  name: string; qty: number | null; unitPrice: number | null;
  total: number | null; category: string | null;
};
type CompetitorAnalysis = {
  competitorName: string | null;
  clientName: string | null;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  perGuestPrice: number | null;
  subtotal: number | null;
  taxes: number | null;
  gratuity: number | null;
  total: number | null;
  lineItems: CompetitorLineItem[];
  menuHighlights: string[];
  serviceStyle: string | null;
  addons: string[];
  notes: string;
  ourSuggestedPrice: { perGuest: number; total: number; rationale: string } | null;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const fmt = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "—" : `$${Number(n).toFixed(2)}`;

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsQuote, setDetailsQuote] = useState<Quote | null>(null);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [analysisFileName, setAnalysisFileName] = useState<string>("");
  // Linkage / save state for competitor analysis
  const [linkMode, setLinkMode] = useState<"guest" | "account">("guest");
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<Array<{ user_id: string; full_name: string | null; email: string | null }>>([]);
  const [linkedClient, setLinkedClient] = useState<{ user_id: string; full_name: string | null; email: string | null } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [savedCompetitorId, setSavedCompetitorId] = useState<string | null>(null);
  const [uploadedReceipt, setUploadedReceipt] = useState<{ id: string; imageUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftQuoteId, setDraftQuoteId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recipeNames, setRecipeNames] = useState<string[]>([]);

  // Load active recipe names whenever an analysis appears, to compute match preview
  useEffect(() => {
    if (!analysis) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("recipes").select("name").eq("active", true);
      if (!cancelled) setRecipeNames((data ?? []).map((r: any) => r.name as string));
    })();
    return () => { cancelled = true; };
  }, [analysis]);

  const matchSummary = useMemo(() => {
    const items = analysis?.lineItems ?? [];
    const total = items.length;
    if (total === 0 || recipeNames.length === 0) return { matched: 0, total };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const set = new Set(recipeNames.map(norm));
    const matched = items.filter((li: any) => li?.name && set.has(norm(li.name))).length;
    return { matched, total };
  }, [analysis, recipeNames]);

  // Search profiles when typing in account mode
  useEffect(() => {
    if (linkMode !== "account" || clientSearch.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const q = clientSearch.trim();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(8);
      if (!cancelled) setClientResults((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [clientSearch, linkMode]);

  // Pre-fill guest fields from analysis when it arrives
  useEffect(() => {
    if (analysis) {
      setGuestName((prev) => prev || analysis.clientName || "");
    }
  }, [analysis]);

  const resetLinkState = () => {
    setLinkMode("guest");
    setClientSearch(""); setClientResults([]); setLinkedClient(null);
    setGuestName(""); setGuestEmail("");
    setSavedCompetitorId(null); setDraftQuoteId(null);
  };

  const saveCompetitorAnalysis = async (): Promise<string | null> => {
    if (!analysis) return null;
    if (savedCompetitorId) return savedCompetitorId;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        created_by: user?.id ?? null,
        client_user_id: linkMode === "account" ? linkedClient?.user_id ?? null : null,
        client_name: linkMode === "account"
          ? linkedClient?.full_name ?? null
          : (guestName || analysis.clientName || null),
        client_email: linkMode === "account"
          ? linkedClient?.email ?? null
          : (guestEmail || null),
        competitor_name: analysis.competitorName,
        event_type: analysis.eventType,
        event_date: analysis.eventDate,
        guest_count: analysis.guestCount,
        per_guest_price: analysis.perGuestPrice,
        subtotal: analysis.subtotal,
        taxes: analysis.taxes,
        gratuity: analysis.gratuity,
        total: analysis.total,
        service_style: analysis.serviceStyle,
        analysis: analysis as any,
        notes: analysis.notes || null,
        source_image_url: uploadedReceipt?.imageUrl ?? null,
      };
      const { data, error } = await (supabase as any)
        .from("competitor_quotes")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      setSavedCompetitorId(data.id);
      toast.success("Competitor quote saved");
      return data.id as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createDraftCounter = async () => {
    if (!analysis) return;
    setCreatingDraft(true);
    try {
      const competitorId = await saveCompetitorAnalysis();
      const ours = analysis.ourSuggestedPrice;
      const total = ours?.total ?? analysis.total ?? 0;
      const guests = analysis.guestCount ?? 1;
      const subtotal = total / 1.08;
      const quoteRow: any = {
        client_name: linkMode === "account"
          ? linkedClient?.full_name ?? null
          : (guestName || analysis.clientName || null),
        client_email: linkMode === "account"
          ? linkedClient?.email ?? null
          : (guestEmail || null),
        user_id: linkMode === "account" ? linkedClient?.user_id ?? null : null,
        event_type: analysis.eventType,
        event_date: analysis.eventDate,
        guest_count: guests,
        subtotal,
        tax_rate: 0.08,
        total,
        status: "draft",
        notes: `Counter to competitor quote${analysis.competitorName ? ` (${analysis.competitorName})` : ""}.${ours?.rationale ? ` ${ours.rationale}` : ""}`,
        dietary_preferences: { serviceStyle: analysis.serviceStyle ?? null, addons: analysis.addons ?? [] },
      };
      const { data: q, error } = await supabase
        .from("quotes")
        .insert(quoteRow)
        .select("id")
        .single();
      if (error) throw error;
      // Pre-fill quote_items from competitor's line items, mapped to recipes when names match
      const lineItems = analysis.lineItems ?? [];
      if (lineItems.length > 0) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const { data: recipes } = await supabase
          .from("recipes")
          .select("id,name,cost_per_serving")
          .eq("active", true);
        const recipeMap = new Map<string, { id: string; name: string; cost_per_serving: number | null }>();
        (recipes ?? []).forEach((r: any) => recipeMap.set(norm(r.name), r));
        const itemsToInsert = lineItems
          .filter((li) => li.name)
          .map((li) => {
            const match = recipeMap.get(norm(li.name));
            const qty = Math.max(1, Math.round(Number(li.qty ?? guests) || guests));
            const competitorUnit = Number(li.unitPrice ?? 0) || 0;
            // If matched to a recipe, use OUR cost_per_serving as the unit price
            // so the counter reflects our actual costing instead of the competitor's price.
            const ourUnit = match && match.cost_per_serving != null ? Number(match.cost_per_serving) : null;
            const unit = ourUnit ?? competitorUnit;
            return {
              quote_id: q.id,
              recipe_id: match?.id ?? null,
              name: match?.name ?? li.name,
              quantity: qty,
              unit_price: unit,
              total_price: ourUnit != null ? unit * qty : (Number(li.total ?? unit * qty) || unit * qty),
            };
          });
        if (itemsToInsert.length > 0) {
          const { error: itemsErr } = await supabase.from("quote_items").insert(itemsToInsert);
          if (itemsErr) console.warn("Failed to insert quote items:", itemsErr.message);
        }
      }
      // Link competitor analysis to the new draft
      if (competitorId) {
        await (supabase as any)
          .from("competitor_quotes")
          .update({ counter_quote_id: q.id })
          .eq("id", competitorId);
      }
      setDraftQuoteId(q.id);
      const matched = analysis.lineItems?.length ?? 0;
      toast.success(matched > 0 ? `Draft counter-quote created with ${matched} line item${matched === 1 ? "" : "s"}` : "Draft counter-quote created");
      loadQuotes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create draft");
    } finally {
      setCreatingDraft(false);
    }
  };

  const onAnalyzeFile = async (file: File) => {
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisFileName(file.name);
    setAnalyzeOpen(true);
    resetLinkState();
    setUploadedReceipt(null);
    try {
      // Convert PDF to first page image, or compress an image directly
      let blob: Blob;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pages = await pdfFileToImageBlobs(file, { scale: 1.8, maxPages: 1 });
        if (!pages.length) throw new Error("Could not render PDF");
        blob = pages[0];
      } else if (file.type.startsWith("image/")) {
        const c = await compressImageBlob(file, { maxEdge: 1800, quality: 0.85 });
        blob = c.blob;
      } else {
        throw new Error("Upload a PDF or image file");
      }

      const base64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("analyze-competitor-quote", {
        body: { imageBase64: base64, mimeType: blob.type || "image/jpeg" },
      });
      if (error) throw error;
      const result = (data as { result?: CompetitorAnalysis })?.result ?? null;
      if (!result) throw new Error("No analysis returned");
      setAnalysis(result);

      // Upload image to receipts bucket and create a receipts row
      try {
        const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const path = `competitor/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: false,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("receipts").getPublicUrl(path);
        const imageUrl = pub.publicUrl;
        const { data: rec, error: recErr } = await supabase
          .from("receipts")
          .insert({
            image_url: imageUrl,
            total_amount: result.total ?? null,
            status: "pending",
            receipt_date: result.eventDate || new Date().toISOString().slice(0, 10),
            extracted_line_items: (result.lineItems ?? []) as any,
          })
          .select("id,image_url")
          .single();
        if (recErr) throw recErr;
        setUploadedReceipt({ id: rec.id, imageUrl: rec.image_url ?? imageUrl });
        toast.success("Competitor quote analyzed and saved as receipt");
      } catch (recErr) {
        console.error("Receipt creation failed", recErr);
        toast.success("Competitor quote analyzed");
        toast.error(recErr instanceof Error ? `Receipt not saved: ${recErr.message}` : "Receipt not saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const loadQuotes = async () => {
    const { data } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (data) setQuotes(data as Quote[]);
  };

  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const id = deleteTarget.id;
      // Detach competitor_quotes counter link (so analyses are preserved)
      await (supabase as any).from("competitor_quotes").update({ counter_quote_id: null }).eq("counter_quote_id", id);
      // Delete dependent rows
      await supabase.from("event_time_entries").delete().eq("quote_id", id);
      await supabase.from("event_prep_tasks").delete().eq("quote_id", id);
      await supabase.from("event_assignments").delete().eq("quote_id", id);
      await supabase.from("quote_items").delete().eq("quote_id", id);
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Quote deleted");
      setDeleteTarget(null);
      loadQuotes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete quote");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => { loadQuotes(); }, []);

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
      <Card className="shadow-warm border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Analyze a competitor quote
            </p>
            <p className="text-sm text-muted-foreground">
              Upload a competitor's PDF or photo. We'll extract pricing and suggest a winning counter-offer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onAnalyzeFile(f);
                }}
              />
              <Button asChild variant="default" size="sm" className="gap-2 cursor-pointer">
                <span><Upload className="w-3.5 h-3.5" /> Upload competitor quote</span>
              </Button>
            </label>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setBulkOpen(true)}>
              <Upload className="w-3.5 h-3.5" /> Bulk upload
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { setDetailsQuote(q); setDetailsOpen(true); }}>
                  <Eye className="w-3.5 h-3.5" /> Details
                </Button>
                {q.conversation?.messages?.length ? (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { setTranscriptQuote(q); setTranscriptOpen(true); }}>
                    <MessageSquare className="w-3.5 h-3.5" /> Transcript
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="gap-2" onClick={() => openAssign(q)}>
                  <Users className="w-3.5 h-3.5" /> Staff
                </Button>
                <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(q)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{deleteTarget?.client_name || "the quote"}</strong> ({deleteTarget?.id.slice(0, 8)}) along with its line items, prep tasks, staff assignments, and time entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quote details dialog: full selections + AI preferences */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quote Details — {detailsQuote?.client_name || "Quote"}</DialogTitle>
          </DialogHeader>
          {detailsQuote && <QuoteDetailsBody q={detailsQuote} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Competitor Quote Analysis
            </DialogTitle>
          </DialogHeader>
          {analysisFileName && (
            <p className="text-xs text-muted-foreground -mt-2">{analysisFileName}</p>
          )}
          {analyzing && (
            <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Reading the quote and crunching numbers…</p>
            </div>
          )}
          {!analyzing && analysis && <CompetitorAnalysisBody a={analysis} />}
          {!analyzing && analysis && (
            <section className="space-y-3 rounded-lg border p-3 mt-2">
              <p className="text-sm font-semibold">Save & link this quote</p>
              <div className="flex gap-2">
                <Button
                  variant={linkMode === "guest" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setLinkMode("guest"); setLinkedClient(null); }}
                  disabled={!!savedCompetitorId}
                >
                  Guest
                </Button>
                <Button
                  variant={linkMode === "account" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLinkMode("account")}
                  disabled={!!savedCompetitorId}
                >
                  Link to account
                </Button>
              </div>

              {linkMode === "guest" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Client name</Label>
                    <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Optional" disabled={!!savedCompetitorId} />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="Optional" disabled={!!savedCompetitorId} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedClient ? (
                    <div className="flex items-center gap-2 p-2 rounded border bg-muted/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{linkedClient.full_name || linkedClient.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{linkedClient.email}</p>
                      </div>
                      {!savedCompetitorId && (
                        <Button variant="ghost" size="sm" onClick={() => setLinkedClient(null)}>Change</Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Search by name or email…"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                      />
                      {clientResults.length > 0 && (
                        <div className="border rounded divide-y max-h-44 overflow-y-auto">
                          {clientResults.map((c) => (
                            <button
                              key={c.user_id}
                              type="button"
                              onClick={() => { setLinkedClient(c); setClientSearch(""); setClientResults([]); }}
                              className="w-full text-left p-2 text-sm hover:bg-muted"
                            >
                              <p className="font-medium">{c.full_name || c.email}</p>
                              {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveCompetitorAnalysis}
                  disabled={saving || !!savedCompetitorId || (linkMode === "account" && !linkedClient)}
                >
                  {saving ? "Saving…" : savedCompetitorId ? "Saved" : "Save analysis"}
                </Button>
                <Button
                  size="sm"
                  onClick={createDraftCounter}
                  disabled={creatingDraft || !!draftQuoteId || (linkMode === "account" && !linkedClient)}
                >
                  {creatingDraft ? "Creating…" : draftQuoteId ? "Draft created ✓" : "Create draft counter-quote"}
                </Button>
              </div>
              {analysis && matchSummary.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  Matched <span className="font-medium text-foreground">{matchSummary.matched}</span> of{" "}
                  <span className="font-medium text-foreground">{matchSummary.total}</span> items to recipes.
                  {matchSummary.matched > 0
                    ? " Matched items will use our cost_per_serving as the unit price."
                    : " Unmatched items keep the competitor's unit price."}
                </p>
              )}
              {savedCompetitorId && (
                <p className="text-xs text-muted-foreground">
                  Saved as {linkMode === "account" ? "linked to account" : "guest"}.
                </p>
              )}
            </section>
          )}
          {!analyzing && !analysis && (
            <p className="text-sm text-muted-foreground py-6 text-center">No analysis to show.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalyzeOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompetitorAnalysisBody({ a }: { a: CompetitorAnalysis }) {
  const ours = a.ourSuggestedPrice;
  const beat =
    ours && a.total != null && a.total > 0
      ? Math.round(((a.total - ours.total) / a.total) * 100)
      : null;
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Competitor</p>
          <p className="font-semibold">{a.competitorName || "Unknown"}</p>
          <p className="text-xs text-muted-foreground">{a.eventType || "—"} · {a.guestCount ?? "?"} guests</p>
        </div>
        <div className="rounded-lg border p-3 bg-muted/30">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Their total</p>
          <p className="font-display text-2xl font-bold">{fmt(a.total)}</p>
          <p className="text-xs text-muted-foreground">{fmt(a.perGuestPrice)}/guest</p>
        </div>
      </section>

      {ours && (
        <section className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
          <p className="text-xs uppercase tracking-wide text-primary font-semibold">Our suggested counter</p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="font-display text-3xl font-bold text-primary">{fmt(ours.total)}</p>
            <p className="text-sm text-muted-foreground">{fmt(ours.perGuest)}/guest</p>
            {beat != null && beat > 0 && (
              <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                Beats by {beat}%
              </span>
            )}
          </div>
          {ours.rationale && <p className="text-sm mt-2 text-muted-foreground">{ours.rationale}</p>}
        </section>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-medium">{fmt(a.subtotal)}</p></div>
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Tax</p><p className="font-medium">{fmt(a.taxes)}</p></div>
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Gratuity</p><p className="font-medium">{fmt(a.gratuity)}</p></div>
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Service</p><p className="font-medium capitalize">{a.serviceStyle || "—"}</p></div>
      </section>

      {a.lineItems?.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line items</h3>
          <div className="rounded-lg border divide-y">
            {a.lineItems.map((li, i) => (
              <div key={i} className="flex items-center gap-3 p-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{li.name}</p>
                  {li.category && <p className="text-xs text-muted-foreground">{li.category}</p>}
                </div>
                {li.qty != null && <span className="text-xs text-muted-foreground">×{li.qty}</span>}
                {li.unitPrice != null && <span className="text-xs text-muted-foreground">{fmt(li.unitPrice)}</span>}
                <span className="font-medium w-20 text-right">{fmt(li.total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {a.menuHighlights?.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Menu highlights</h3>
          <div className="flex flex-wrap gap-1.5">
            {a.menuHighlights.map((m, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-muted">{m}</span>
            ))}
          </div>
        </section>
      )}

      {a.addons?.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Add-ons</h3>
          <p className="text-sm">{a.addons.join(", ")}</p>
        </section>
      )}

      {a.notes && (
        <section className="space-y-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
          <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{a.notes}</p>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm py-1">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right capitalize">{value}</span>
    </div>
  );
}

function QuoteDetailsBody({ q }: { q: Quote }) {
  const dp = q.dietary_preferences || {};
  const p = dp.preferences || {};
  const list = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "");

  return (
    <div className="space-y-5 pr-1">
      <section className="space-y-1">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Client & Event</h3>
        <Row label="Client" value={q.client_name} />
        <Row label="Email" value={q.client_email} />
        <Row label="Event" value={q.event_type} />
        <Row label="Date" value={q.event_date} />
        <Row label="Guests" value={String(q.guest_count)} />
        <Row label="Venue" value={q.location_name} />
        <Row label="Address" value={q.location_address} />
        <Row label="Total" value={`$${Number(q.total).toFixed(2)}`} />
        <Row label="Status" value={q.status} />
      </section>

      <section className="space-y-1">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Menu & Service</h3>
        <Row label="Style" value={dp.style} />
        <Row label="Proteins" value={list(dp.proteins)} />
        <Row label="Service" value={dp.serviceStyle} />
        <Row label="Tier" value={dp.tier} />
        <Row label="Allergies" value={list(dp.allergies)} />
        <Row label="Extras" value={list(dp.extras)} />
        <Row label="Add-ons" value={list(dp.addons)} />
      </section>

      {(p.proteinDetails || p.vegetableNotes || p.cuisineLean || p.spiceLevel || p.vibe || p.notes || p.alcohol) && (
        <section className="space-y-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Chef Preferences</h3>
          <Row label="Protein notes" value={p.proteinDetails} />
          <Row label="Vegetables" value={p.vegetableNotes} />
          <Row label="Cuisine lean" value={p.cuisineLean} />
          <Row label="Spice" value={p.spiceLevel} />
          <Row label="Vibe" value={p.vibe} />
          {p.alcohol && (
            <>
              <Row label="Beer" value={p.alcohol.beer} />
              <Row label="Wine" value={p.alcohol.wine} />
              <Row label="Spirits" value={p.alcohol.spirits} />
              <Row label="Signature cocktail" value={p.alcohol.signatureCocktail} />
            </>
          )}
          <Row label="Notes" value={p.notes} />
        </section>
      )}

      {q.notes && (
        <section className="space-y-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quote Notes</h3>
          <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{q.notes}</p>
        </section>
      )}
    </div>
  );
}
