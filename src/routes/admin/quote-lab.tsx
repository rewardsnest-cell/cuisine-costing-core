import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Plus, MessageSquare, Eye, RefreshCw, Mail, MailX, ExternalLink, DollarSign, EyeOff, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PRICING_VISIBILITY_KEY, usePricingVisibility } from "@/lib/use-pricing-visibility";

/**
 * Guardrails — Quote Lab safety contract
 * --------------------------------------
 * Quote Lab is admin-only sandbox. To prevent test actions from ever writing
 * pricing or market intelligence data into production quote records, every
 * write path in this file MUST go through these helpers:
 *
 *   - LAB_ALLOWED_QUOTE_UPDATE_FIELDS — whitelist of safe columns Lab may write.
 *   - LAB_FORBIDDEN_QUOTE_FIELDS      — explicit deny-list (pricing/cost/market).
 *   - assertLabSafeQuoteUpdate(patch) — throws if any patch key is forbidden or
 *                                       not on the whitelist.
 *   - assertLabTargetQuote(quote)     — throws if the quote is not is_test=true.
 *
 * Any new write must extend the whitelist deliberately. Anything pricing- or
 * market-intelligence-related (subtotal, tax_rate, total, theoretical_cost,
 * actual_cost, competitor_*, market_*, pricing_*) is permanently denied.
 */

// Columns Quote Lab is allowed to write on the `quotes` table.
const LAB_ALLOWED_QUOTE_UPDATE_FIELDS = new Set<string>([
  "client_name",
  "client_email",
  "client_phone",
  "event_type",
  "event_date",
  "guest_count",
  "dietary_preferences",
  "notes",
  "location_name",
  "location_address",
  "quote_state",
  "status",
  "is_test",
  "conversation",
]);

// Explicit deny-list — pricing & market intelligence outputs. Even if added to
// the whitelist by mistake, these patterns are double-checked at runtime.
const LAB_FORBIDDEN_FIELD_PATTERNS = [
  /^subtotal$/i,
  /^total$/i,
  /^tax_/i,
  /^theoretical_cost$/i,
  /^actual_cost$/i,
  /^.*_cost$/i,
  /^.*_price$/i,
  /^pricing_/i,
  /^competitor_/i,
  /^market_/i,
  /^margin_/i,
];

function isForbiddenField(key: string): boolean {
  if (!LAB_ALLOWED_QUOTE_UPDATE_FIELDS.has(key)) return true;
  return LAB_FORBIDDEN_FIELD_PATTERNS.some((re) => re.test(key));
}

function assertLabSafeQuoteUpdate(patch: Record<string, unknown>) {
  const offenders = Object.keys(patch).filter(isForbiddenField);
  if (offenders.length) {
    const msg = `Quote Lab guardrail blocked write to: ${offenders.join(", ")}`;
    console.error("[quote-lab guardrail]", msg, patch);
    throw new Error(msg);
  }
}

function assertLabTargetQuote(q: { is_test: boolean; reference_number: string | null; id: string }) {
  if (!q.is_test) {
    const ref = q.reference_number ?? q.id.slice(0, 8);
    throw new Error(`Refusing to operate on non-TEST quote ${ref}. Promote to TEST first or open it in Saved Quotes.`);
  }
}

/**
 * Safe wrapper for any Lab-originated quote update. Validates the patch and
 * the target row's is_test flag before issuing the Supabase update. Returns
 * the Supabase response so callers can keep their existing error handling.
 */
async function labSafeUpdateQuote(
  target: { id: string; is_test: boolean; reference_number: string | null },
  patch: Record<string, unknown>,
) {
  assertLabTargetQuote(target);
  assertLabSafeQuoteUpdate(patch);
  return (supabase as any).from("quotes").update(patch).eq("id", target.id).eq("is_test", true);
}

export const Route = createFileRoute("/admin/quote-lab")({
  head: () => ({
    meta: [
      { title: "Quote Lab — VPS Finest" },
      { name: "description", content: "Admin sandbox for testing quote intake, structuring, and AI concierge flows." },
    ],
  }),
  component: QuoteLabPage,
});

const QUOTE_STATES = ["initiated", "info_collected", "structured", "awaiting_pricing"] as const;
type QuoteState = (typeof QUOTE_STATES)[number];

type LabQuote = {
  id: string;
  reference_number: string | null;
  client_name: string | null;
  client_email: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  is_test: boolean;
  quote_state: QuoteState;
  status: string;
  created_at: string;
  dietary_preferences: any;
  conversation: any;
};

const EMAIL_TOGGLE_KEY = "quote_lab_emails_enabled";

function QuoteLabPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showPricing, loading: pricingLoading } = usePricingVisibility();
  const [pricingSaving, setPricingSaving] = useState(false);
  const [quotes, setQuotes] = useState<LabQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"test" | "real" | "all">("test");
  const [creating, setCreating] = useState(false);
  const [transcriptFor, setTranscriptFor] = useState<LabQuote | null>(null);
  const [editing, setEditing] = useState<LabQuote | null>(null);
  const [emailsEnabled, setEmailsEnabled] = useState(false);

  // Email toggle is local-only for now (no email is wired up yet for quote intake).
  // Persist preference so admins see consistent state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setEmailsEnabled(localStorage.getItem(EMAIL_TOGGLE_KEY) === "true");
  }, []);
  const updateEmailsEnabled = (v: boolean) => {
    setEmailsEnabled(v);
    if (typeof window !== "undefined") localStorage.setItem(EMAIL_TOGGLE_KEY, String(v));
  };

  const togglePricing = async (visible: boolean) => {
    setPricingSaving(true);
    // value === "false" means pricing is SHOWN; anything else hides it.
    const { error } = await (supabase as any)
      .from("app_kv")
      .upsert({
        key: PRICING_VISIBILITY_KEY,
        value: visible ? "false" : "true",
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
    setPricingSaving(false);
    if (error) {
      console.error(error);
      toast.error("Couldn't update pricing visibility");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["app_kv", PRICING_VISIBILITY_KEY] });
    toast.success(visible ? "Pricing is now VISIBLE on public pages" : "Pricing is now HIDDEN on public pages");
  };

  const openPreview = (path: string) => {
    if (typeof window === "undefined") return;
    window.open(path, "_blank", "noopener,noreferrer");
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("quotes")
      .select("id, reference_number, client_name, client_email, event_type, event_date, guest_count, is_test, quote_state, status, created_at, dietary_preferences, conversation")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      toast.error("Failed to load quotes");
    } else {
      setQuotes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    if (filter === "all") return quotes;
    return quotes.filter((q) => (filter === "test" ? q.is_test : !q.is_test));
  }, [quotes, filter]);

  const createTestQuote = async () => {
    setCreating(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const { data, error } = await (supabase as any)
        .from("quotes")
        .insert({
          client_name: `TEST Client (${stamp})`,
          client_email: `test+${Date.now()}@example.com`,
          event_type: "Wedding",
          guest_count: 1,
          dietary_preferences: { intake: { sourcePage: "admin/quote-lab", venue: "Test venue" } },
          quote_state: "initiated",
          status: "draft",
          is_test: true,
          user_id: user?.id || null,
        })
        .select("id, reference_number")
        .single();
      if (error) throw error;
      toast.success("Test quote created", { description: `Reference: ${data?.reference_number ?? "—"}` });
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create test quote");
    } finally {
      setCreating(false);
    }
  };

  const toggleTest = async (q: LabQuote, value: boolean) => {
    // Guardrail: Quote Lab will not promote a TEST quote into a REAL one.
    // Real quotes must be created through the public intake flow.
    if (q.is_test && !value) {
      toast.error("Quote Lab can't convert TEST → REAL. Use Saved Quotes for promotions.");
      return;
    }
    if (!q.is_test && value) {
      // Marking an existing real quote as TEST is allowed (it removes it from
      // production reporting), but we surface a clear confirmation toast.
      const ok = typeof window === "undefined" ? true : window.confirm(
        `Mark real quote ${q.reference_number ?? q.id.slice(0, 8)} as TEST? It will be excluded from production analytics.`,
      );
      if (!ok) return;
    }
    try {
      const { error } = await (supabase as any)
        .from("quotes")
        .update({ is_test: value })
        .eq("id", q.id);
      if (error) throw error;
      setQuotes((qs) => qs.map((x) => (x.id === q.id ? { ...x, is_test: value } : x)));
      toast.success(value ? "Marked as TEST" : "Marked as REAL");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't update TEST flag");
    }
  };

  const setState = async (q: LabQuote, state: QuoteState) => {
    try {
      const { error } = await labSafeUpdateQuote(q, { quote_state: state });
      if (error) throw error;
      setQuotes((qs) => qs.map((x) => (x.id === q.id ? { ...x, quote_state: state } : x)));
      toast.success(`State set to ${state}`);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't change state");
    }
  };

  const transcript: { role: string; content: string }[] | null = (() => {
    const conv = transcriptFor?.conversation;
    if (!conv) return null;
    if (Array.isArray(conv?.messages)) return conv.messages;
    return null;
  })();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h1 className="font-display text-2xl font-bold">Quote Lab</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Admin-only sandbox for Phase Two quote intake. Create test quotes, force them through states,
            and inspect AI concierge transcripts without affecting real customers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={createTestQuote} disabled={creating} className="gap-1.5">
            <Plus className="w-4 h-4" /> {creating ? "Creating…" : "New test quote"}
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {emailsEnabled ? <Mail className="w-4 h-4 text-primary" /> : <MailX className="w-4 h-4 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium">Email sending {emailsEnabled ? "ENABLED" : "DISABLED"}</p>
              <p className="text-xs text-muted-foreground">
                Test quotes never send confirmation emails by default. Toggle on only for end-to-end checks.
              </p>
            </div>
          </div>
          <Switch checked={emailsEnabled} onCheckedChange={updateEmailsEnabled} />
        </CardContent>
      </Card>

      <Card className={showPricing ? "border-amber-500/60 bg-amber-50/40 dark:bg-amber-950/10" : ""}>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {showPricing ? <DollarSign className="w-4 h-4 text-amber-600" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">
                  Public pricing {pricingLoading ? "…" : showPricing ? "VISIBLE" : "HIDDEN"}
                </p>
                <p className="text-xs text-muted-foreground max-w-xl">
                  Phase Two default is HIDDEN. Toggle on only to validate pricing UI internally — every public visitor
                  will see prices the moment this is on.
                </p>
              </div>
            </div>
            <Switch
              checked={showPricing}
              disabled={pricingLoading || pricingSaving}
              onCheckedChange={togglePricing}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
            <span className="text-xs text-muted-foreground mr-1">Preview public flows:</span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openPreview("/quote/start")}>
              <ExternalLink className="w-3.5 h-3.5" /> Intake
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openPreview("/catering/quote")}>
              <ExternalLink className="w-3.5 h-3.5" /> Builder
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="test">Test ({quotes.filter((q) => q.is_test).length})</TabsTrigger>
          <TabsTrigger value="real">Real ({quotes.filter((q) => !q.is_test).length})</TabsTrigger>
          <TabsTrigger value="all">All ({quotes.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading quotes…</p>}
        {!loading && visible.length === 0 && (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            No {filter === "all" ? "" : filter} quotes yet.
          </CardContent></Card>
        )}
        {visible.map((q) => {
          const hasTranscript = Array.isArray(q.conversation?.messages) && q.conversation.messages.length > 0;
          return (
            <Card key={q.id} className={q.is_test ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10" : ""}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {q.is_test && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30">
                          TEST
                        </Badge>
                      )}
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {q.reference_number || q.id.slice(0, 8)}
                      </Badge>
                      <Badge variant="outline">{q.quote_state}</Badge>
                    </div>
                    <p className="font-medium text-sm">
                      {q.client_name || <span className="text-muted-foreground">No name</span>}
                      {" · "}
                      <span className="text-muted-foreground">{q.client_email || "no email"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {q.event_type || "No event type"}
                      {q.event_date ? ` · ${q.event_date}` : ""}
                      {" · "}
                      Created {new Date(q.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs">
                      <Label htmlFor={`test-${q.id}`} className="cursor-pointer">TEST</Label>
                      <Switch
                        id={`test-${q.id}`}
                        checked={q.is_test}
                        onCheckedChange={(v) => toggleTest(q, v)}
                      />
                    </div>
                    <Select value={q.quote_state} onValueChange={(v) => setState(q, v as QuoteState)}>
                      <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUOTE_STATES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasTranscript && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setTranscriptFor(q)}>
                        <MessageSquare className="w-3.5 h-3.5" /> Transcript
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(q)}>
                      <Eye className="w-3.5 h-3.5" /> Edit intake
                    </Button>
                    <Link to="/admin/quotes/$id" params={{ id: q.id }}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        Open <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transcript dialog */}
      <Dialog open={!!transcriptFor} onOpenChange={(o) => !o && setTranscriptFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Concierge Transcript · {transcriptFor?.reference_number}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
            {transcript?.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {(!transcript || transcript.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">No transcript on this quote.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit intake dialog */}
      <EditIntakeDialog
        quote={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
      />
    </div>
  );
}

function EditIntakeDialog({
  quote, onClose, onSaved,
}: { quote: LabQuote | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!quote) return;
    setName(quote.client_name || "");
    setEmail(quote.client_email || "");
    setEventType(quote.event_type || "");
    setEventDate(quote.event_date || "");
  }, [quote]);

  if (!quote) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("quotes")
      .update({
        client_name: name || null,
        client_email: email || null,
        event_type: eventType || null,
        event_date: eventDate || null,
      })
      .eq("id", quote.id);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Save failed");
      return;
    }
    toast.success("Intake updated");
    onSaved();
  };

  return (
    <Dialog open={!!quote} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit intake · {quote.reference_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Client name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Client email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Event type</Label><Input value={eventType} onChange={(e) => setEventType(e.target.value)} /></div>
          <div><Label>Event date</Label><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
