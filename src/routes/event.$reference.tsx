import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, MapPin, Users, Lock, AlertTriangle, CheckCircle, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/event/$reference")({
  head: ({ params }) => ({
    meta: [
      { title: `Event ${params.reference} — TasteQuote` },
      { name: "description", content: "View and manage your catering event." },
    ],
  }),
  component: EventPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center px-4">
      <p className="text-destructive">Error loading event: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-muted-foreground mb-4">Event not found.</p>
        <Link to="/" className="text-primary underline">Go home</Link>
      </div>
    </div>
  ),
});

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
  reference_number: string | null;
  client_name: string | null;
  client_email: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  location_name: string | null;
  location_address: string | null;
  subtotal: number | null;
  total: number | null;
  status: string;
  notes: string | null;
  dietary_preferences: DietaryPrefs | null;
  conversation: ChatMessage[] | null;
};

type ChatMessage = { role: string; content: string; ts?: string | number };

type LineItem = { id: string; name: string; quantity: number; unit_price: number; total_price: number };

function EventPage() {
  const { reference } = Route.useParams();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [lockDays, setLockDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    location_name: "", location_address: "", guest_count: 0, event_date: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    const [{ data: q }, { data: settings }] = await Promise.all([
      (supabase as any).from("quotes").select("*").eq("reference_number", reference).maybeSingle(),
      (supabase as any).from("app_settings").select("revision_lock_days").eq("id", 1).maybeSingle(),
    ]);
    if (q) {
      setQuote(q as Quote);
      setForm({
        location_name: q.location_name ?? "",
        location_address: q.location_address ?? "",
        guest_count: q.guest_count ?? 0,
        event_date: q.event_date ?? "",
        notes: q.notes ?? "",
      });
      const { data: li } = await supabase.from("quote_items").select("*").eq("quote_id", q.id);
      setItems((li ?? []) as LineItem[]);
    }
    setLockDays(settings?.revision_lock_days ?? 7);
    setLoading(false);
  };

  useEffect(() => { load(); }, [reference]);

  const { locked, daysLeft, cutoffDate } = useMemo(() => {
    if (!quote?.event_date) return { locked: false, daysLeft: null as number | null, cutoffDate: null as string | null };
    const event = new Date(quote.event_date + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(event); cutoff.setDate(cutoff.getDate() - lockDays);
    const msPerDay = 86400000;
    const daysToCutoff = Math.ceil((cutoff.getTime() - today.getTime()) / msPerDay);
    return { locked: today > cutoff, daysLeft: daysToCutoff, cutoffDate: cutoff.toISOString().split("T")[0] };
  }, [quote, lockDays]);

  const save = async () => {
    if (!quote) return;
    setSaving(true);
    const { error } = await (supabase as any).from("quotes").update({
      location_name: form.location_name || null,
      location_address: form.location_address || null,
      guest_count: form.guest_count,
      event_date: form.event_date || null,
      notes: form.notes || null,
    }).eq("id", quote.id);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("locked") ? `Quote is locked — revisions closed ${lockDays} days before the event.` : error.message);
      return;
    }
    toast.success("Saved");
    setEditing(false);
    load();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading event...</div>;
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-16 px-4 text-center">
          <AlertTriangle className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No event found for reference <span className="font-mono">{reference}</span></p>
          <Link to="/lookup" className="text-primary underline text-sm mt-3 inline-block">Try a different reference</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground font-mono">Ref: {quote.reference_number}</p>
              <h1 className="font-display text-3xl font-bold">{quote.event_type || "Event"}</h1>
              <p className="text-muted-foreground text-sm">For {quote.client_name || "—"}</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">{quote.status}</span>
          </div>

          {/* Lock status banner */}
          {locked ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Lock className="w-5 h-5 text-destructive shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-destructive">Revisions closed</p>
                  <p className="text-muted-foreground">This event is within {lockDays} days. Contact us if you need changes.</p>
                </div>
              </CardContent>
            </Card>
          ) : daysLeft !== null && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Revisions close in {daysLeft} day{daysLeft === 1 ? "" : "s"}</p>
                  <p className="text-muted-foreground">After {cutoffDate}, this event will be locked.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Event details */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Event Details</h2>
                {!editing && !locked && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Revise</Button>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div><Label>Venue / Location Name</Label><Input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} /></div>
                  <div><Label>Venue Address</Label><Input value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Guest Count</Label><Input type="number" value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>Event Date</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any updates?" /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <CalendarDays className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div><p className="text-muted-foreground text-xs">Event date</p><p className="font-medium">{quote.event_date || "TBD"}</p></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div><p className="text-muted-foreground text-xs">Guests</p><p className="font-medium">{quote.guest_count}</p></div>
                  </div>
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Location</p>
                      <p className="font-medium">{quote.location_name || "Not set"}</p>
                      {quote.location_address && <p className="text-xs text-muted-foreground">{quote.location_address}</p>}
                    </div>
                  </div>
                  {quote.notes && (
                    <div className="sm:col-span-2 bg-muted/50 rounded-md p-3 text-sm">{quote.notes}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Menu, allergies & chef preferences */}
          <PreferencesCard prefs={quote.dietary_preferences} />

          {/* AI conversation transcript */}
          <TranscriptCard conversation={quote.conversation} />

          {/* Quote summary */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <h2 className="font-display text-lg font-semibold">Quote</h2>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items recorded.</p>
              ) : (
                <ul className="divide-y">
                  {items.map((it) => (
                    <li key={it.id} className="py-2 flex justify-between text-sm">
                      <span>{it.name} <span className="text-muted-foreground">×{it.quantity}</span></span>
                      <span className="font-medium">${Number(it.total_price).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-semibold">Total</span>
                <span className="font-display text-2xl font-bold">${Number(quote.total ?? 0).toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TranscriptCard({ conversation }: { conversation: ChatMessage[] | null }) {
  const [open, setOpen] = useState(false);
  const msgs = (conversation || []).filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  if (msgs.length === 0) return null;
  const preview = msgs.slice(-3);
  const shown = open ? msgs : preview;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">Conversation</h2>
          </div>
          <span className="text-xs text-muted-foreground">{msgs.length} message{msgs.length === 1 ? "" : "s"}</span>
        </div>
        <p className="text-xs text-muted-foreground">The chat with our AI assistant that helped shape this quote.</p>
        <div className="space-y-2">
          {!open && msgs.length > preview.length && (
            <p className="text-xs text-muted-foreground italic text-center">Showing last {preview.length} of {msgs.length} messages</p>
          )}
          {shown.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}>
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>
        {msgs.length > preview.length && (
          <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(o => !o)}>
            {open ? "Show less" : `Show full conversation (${msgs.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PrefRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm py-1">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right capitalize">{value}</span>
    </div>
  );
}

function PreferencesCard({ prefs }: { prefs: DietaryPrefs | null }) {
  const dp = prefs || {};
  const p = dp.preferences || {};
  const list = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "");
  const hasMenu = dp.style || (dp.proteins && dp.proteins.length) || dp.serviceStyle || dp.tier
    || (dp.allergies && dp.allergies.length) || (dp.extras && dp.extras.length) || (dp.addons && dp.addons.length);
  const hasChef = p.proteinDetails || p.vegetableNotes || p.cuisineLean || p.spiceLevel || p.vibe || p.notes || p.alcohol;
  if (!hasMenu && !hasChef) return null;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Menu Preferences</h2>

        {hasMenu && (
          <div className="space-y-1">
            <PrefRow label="Style" value={dp.style} />
            <PrefRow label="Proteins" value={list(dp.proteins)} />
            <PrefRow label="Service" value={dp.serviceStyle} />
            <PrefRow label="Tier" value={dp.tier} />
            <PrefRow label="Allergies" value={list(dp.allergies)} />
            <PrefRow label="Extras" value={list(dp.extras)} />
            <PrefRow label="Add-ons" value={list(dp.addons)} />
          </div>
        )}

        {hasChef && (
          <div className="border-t pt-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Chef preferences</p>
            <PrefRow label="Protein notes" value={p.proteinDetails} />
            <PrefRow label="Vegetables" value={p.vegetableNotes} />
            <PrefRow label="Cuisine lean" value={p.cuisineLean} />
            <PrefRow label="Spice" value={p.spiceLevel} />
            <PrefRow label="Vibe" value={p.vibe} />
            {p.alcohol && (
              <>
                <PrefRow label="Beer" value={p.alcohol.beer} />
                <PrefRow label="Wine" value={p.alcohol.wine} />
                <PrefRow label="Spirits" value={p.alcohol.spirits} />
                <PrefRow label="Signature cocktail" value={p.alcohol.signatureCocktail} />
              </>
            )}
            <PrefRow label="Notes" value={p.notes} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
