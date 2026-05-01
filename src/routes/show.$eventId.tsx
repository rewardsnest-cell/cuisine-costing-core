import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, Sparkles } from "lucide-react";
import vpsLogo from "@/assets/vpsfinest-logo.png";
import { calculateLeadPriority, GUEST_BANDS } from "@/lib/sales-hub/lead-priority";

export const Route = createFileRoute("/show/$eventId")({
  component: KioskPage,
  head: () => ({ meta: [{ title: "VPS Finest — Lead Capture" }, { name: "robots", content: "noindex" }] }),
});

type ShowEvent = { id: string; event_name: string; event_type: string; kiosk_active: boolean };
type Prize = { id: string; prize_name: string; weight: number };

const EVENT_TYPE_OPTIONS = ["Wedding", "Corporate", "Social", "Catering"] as const;

function KioskPage() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState<{ leadId: string } | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    event_type: "" as string,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    event_date: "",
    no_date: false,
    guest_band: "" as string,
    venue_selected: null as boolean | null,
    consent: false,
  });

  useEffect(() => {
    (async () => {
      const [evRes, prizeRes] = await Promise.all([
        (supabase as any).from("show_events").select("id, event_name, event_type, kiosk_active").eq("id", eventId).maybeSingle(),
        (supabase as any).from("show_prizes").select("id, prize_name, weight").eq("active", true),
      ]);
      setEvent(evRes.data || null);
      setPrizes(prizeRes.data || []);
      setLoading(false);
    })();
  }, [eventId]);

  const reset = () => {
    setSubmitted(null);
    setForm({ event_type: "", first_name: "", last_name: "", email: "", phone: "", event_date: "", no_date: false, guest_band: "", venue_selected: null, consent: false });
  };

  const submit = async () => {
    if (!form.event_type) return toast.error("Pick an event type");
    if (!form.first_name.trim()) return toast.error("Name required");
    if (!form.email.trim() && !form.phone.trim()) return toast.error("Email or phone required");
    if (!form.consent) return toast.error("Consent required");
    if (form.event_type === "Wedding" && form.venue_selected === null) return toast.error("Venue selected? Pick one");

    setSubmitting(true);
    const priority = calculateLeadPriority({
      eventType: form.event_type,
      eventDate: form.no_date ? null : form.event_date || null,
      guestBand: (form.guest_band || null) as any,
      venueSelected: form.venue_selected,
    });

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      name: [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" "),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      lead_type: "show",
      source: "kiosk",
      source_type: "show",
      source_event_id: eventId,
      event_type: form.event_type,
      event_date: form.no_date ? null : form.event_date || null,
      guest_count_band: form.guest_band || null,
      venue_selected: form.event_type === "Wedding" ? form.venue_selected : null,
      consent_contact: true,
      priority_level: priority,
      status: "new",
    };

    const { data, error } = await (supabase as any).from("leads").insert(payload).select("id").single();
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setSubmitted({ leadId: data.id });
  };

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!event || !event.kiosk_active) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <img src={vpsLogo} alt="VPS Finest" className="h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-display font-semibold">Kiosk inactive</h1>
          <p className="text-muted-foreground mt-2">This show is not currently accepting captures.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return <ThankYou leadId={submitted.leadId} prizes={prizes} onDone={reset} />;
  }

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10 flex flex-col">
      <header className="flex items-center gap-3 mb-6">
        <img src={vpsLogo} alt="VPS Finest" className="h-12" />
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">VPS Finest · {event.event_name}</p>
          <h1 className="text-xl font-display font-semibold">Let's stay in touch</h1>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full space-y-5">
        <Section label="Event type">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {EVENT_TYPE_OPTIONS.map((t) => {
              const active = form.event_type === t;
              return (
                <button key={t} type="button" onClick={() => setForm({ ...form, event_type: t })}
                  className={`h-16 rounded-lg border-2 font-medium text-base transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}>
                  {t === "Wedding" ? "Wedding" : t === "Social" ? "Not Sure" : t}
                </button>
              );
            })}
          </div>
        </Section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BigInput label="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
          <BigInput label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
          <BigInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <BigInput label="Mobile phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />
        </div>

        <Section label="Event date">
          <div className="flex items-center gap-3">
            <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value, no_date: false })} className="h-12 text-base flex-1" disabled={form.no_date} />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.no_date} onCheckedChange={(v) => setForm({ ...form, no_date: !!v, event_date: v ? "" : form.event_date })} />
              Not Set
            </label>
          </div>
        </Section>

        <Section label="Guest count">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GUEST_BANDS.map((b) => {
              const active = form.guest_band === b;
              return (
                <button key={b} type="button" onClick={() => setForm({ ...form, guest_band: b })}
                  className={`h-14 rounded-lg border-2 font-medium transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}>
                  {b}
                </button>
              );
            })}
          </div>
        </Section>

        {form.event_type === "Wedding" && (
          <Section label="Venue selected?">
            <div className="grid grid-cols-2 gap-2">
              {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map((o) => {
                const active = form.venue_selected === o.v;
                return (
                  <button key={o.l} type="button" onClick={() => setForm({ ...form, venue_selected: o.v })}
                    className={`h-14 rounded-lg border-2 font-medium transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}>
                    {o.l}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-border bg-card cursor-pointer">
          <Checkbox checked={form.consent} onCheckedChange={(v) => setForm({ ...form, consent: !!v })} className="mt-1" />
          <span className="text-base">Yes, VPS Finest may contact me about my event.</span>
        </label>

        <Button onClick={submit} disabled={submitting} className="w-full h-16 text-lg font-semibold">
          {submitting ? "Saving…" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}

function BigInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} className="h-12 text-base mt-1" autoComplete="off" />
    </div>
  );
}

function ThankYou({ leadId, prizes, onDone }: { leadId: string; prizes: Prize[]; onDone: () => void }) {
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);

  const winner = useMemo(() => {
    if (prizes.length === 0) return null;
    const total = prizes.reduce((s, p) => s + Math.max(p.weight, 1), 0);
    let r = Math.random() * total;
    for (const p of prizes) {
      r -= Math.max(p.weight, 1);
      if (r <= 0) return p;
    }
    return prizes[0];
  }, [prizes]);

  const spin = async () => {
    if (!winner) return;
    setSpinning(true);
    await new Promise((r) => setTimeout(r, 1800));
    const { error } = await (supabase as any).from("lead_prize_spins").insert({
      lead_id: leadId, prize_id: winner.id, prize_name_snapshot: winner.prize_name,
    });
    if (error) {
      toast.error(error.message);
      setSpinning(false);
      return;
    }
    setWon(winner.prize_name);
    setSpinning(false);
    setTimeout(onDone, 4000);
  };

  useEffect(() => {
    if (skipped || won) {
      const t = setTimeout(onDone, 3000);
      return () => clearTimeout(t);
    }
  }, [skipped, won, onDone]);

  return (
    <div className="min-h-screen grid place-items-center p-6 text-center bg-background">
      <div className="max-w-lg w-full space-y-6">
        <CheckCircle2 className="h-20 w-20 mx-auto text-emerald-600" />
        <div>
          <h1 className="text-3xl font-display font-bold">Thank you!</h1>
          <p className="text-muted-foreground mt-2">We'll be in touch shortly.</p>
        </div>

        {prizes.length > 0 && !won && !skipped && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <p className="font-display font-semibold">Spin to win a perk</p>
            </div>
            <Button onClick={spin} disabled={spinning} className="w-full h-14 text-lg">
              {spinning ? "Spinning…" : "Spin the wheel"}
            </Button>
            <button className="text-xs text-muted-foreground underline" onClick={() => setSkipped(true)}>No thanks</button>
          </div>
        )}

        {won && (
          <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/10 p-6">
            <p className="text-sm uppercase tracking-wider text-emerald-700">You won</p>
            <p className="text-2xl font-display font-bold mt-1">{won}</p>
            <p className="text-xs text-muted-foreground mt-2">Mention this when our team follows up.</p>
          </div>
        )}
      </div>
    </div>
  );
}
