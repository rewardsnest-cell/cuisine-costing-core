import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { detectEntrySource, type EntrySource, ENTRY_SOURCE_LABELS } from "@/lib/entry-source";

type LeadMagnet = "printable" | "scaling" | "checklist" | "pack";

const OPTIONS: { value: LeadMagnet; label: string; blurb: string }[] = [
  { value: "printable", label: "Printable PDF", blurb: "A clean, one-page version of this recipe." },
  { value: "scaling",   label: "Party-size scaling guide", blurb: "How to scale this recipe for 20, 50, or 100 guests." },
  { value: "checklist", label: "Event prep checklist", blurb: "What to do 3 days, 1 day, and morning-of." },
  { value: "pack",      label: "3-recipe mini pack",    blurb: "Three related recipes that pair with this one." },
];

export function RecipeEmailCTA({ recipeId, recipeName }: { recipeId: string; recipeName: string }) {
  const [email, setEmail] = useState("");
  const [magnet, setMagnet] = useState<LeadMagnet>("printable");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ printableUrl: string | null } | null>(null);
  const [entrySource, setEntrySource] = useState<EntrySource>("direct");
  const [sourceTouched, setSourceTouched] = useState(false);

  useEffect(() => {
    setEntrySource(detectEntrySource());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/recipe-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), recipeId, leadMagnet: magnet, entrySource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      setDone({ printableUrl: data.printableUrl });
      toast.success("Check your inbox — your guide is on its way.");
    } catch (err: any) {
      toast.error(err.message || "Could not sign you up");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-8 text-center">
        <h3 className="font-display text-2xl text-primary mb-2">Thanks — it's on its way.</h3>
        <p className="text-muted-foreground mb-4">
          Your copy of <strong>{recipeName}</strong> is heading to your inbox. Want it now?
        </p>
        {done.printableUrl && (
          <a href={done.printableUrl} target="_blank" rel="noopener">
            <Button>Open printable PDF</Button>
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-primary/5 border border-primary/20 p-8">
      <div className="text-center mb-5">
        <h3 className="font-display text-2xl text-primary mb-2">Save this recipe — get the printable</h3>
        <p className="text-muted-foreground">Pick what would help most. We'll email it now and a few related recipes over the next week.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`text-left text-sm border rounded-lg p-3 cursor-pointer transition ${
              magnet === o.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
            }`}
          >
            <input
              type="radio"
              name="magnet"
              className="sr-only"
              checked={magnet === o.value}
              onChange={() => setMagnet(o.value)}
            />
            <div className="font-medium text-foreground">{o.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{o.blurb}</div>
          </label>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
        <Input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>{loading ? "Sending…" : "Send it to me"}</Button>
      </div>
      <div className="max-w-xl mx-auto mt-3">
        <label className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
          How did you find us?
          <select
            value={entrySource}
            onChange={(e) => { setEntrySource(e.target.value as EntrySource); setSourceTouched(true); }}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          >
            {Object.entries(ENTRY_SOURCE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          {!sourceTouched && <span className="text-muted-foreground/70">(auto-detected)</span>}
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-3">
        One useful email now, plus 3 over the next week. Unsubscribe anytime.
      </p>
    </form>
  );
}
