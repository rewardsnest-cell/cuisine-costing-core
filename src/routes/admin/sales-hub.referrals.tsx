import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { REFERRAL_ASK } from "@/lib/sales-hub/scripts";

export const Route = createFileRoute("/admin/sales-hub/referrals")({
  component: ReferralsPage,
});

const STATUSES = ["open", "introduced", "booked", "closed-no"];

function ReferralsPage() {
  const [link, setLink] = useState("");
  const [recentReviews, setRecentReviews] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [draft, setDraft] = useState({ referrer_name: "", referred_name: "", referred_contact: "", notes: "", status: "open" });

  const load = async () => {
    const [kv, reviews, refs] = await Promise.all([
      (supabase as any).from("app_kv").select("value").eq("key", "google_review_link").maybeSingle(),
      (supabase as any).from("sales_review_asks").select("*").eq("review_received", true).eq("star_rating", 5).order("asked_at", { ascending: false }).limit(10),
      (supabase as any).from("sales_referrals").select("*").order("asked_at", { ascending: false }),
    ]);
    setLink(kv?.data?.value || "");
    setRecentReviews(reviews?.data || []);
    setReferrals(refs?.data || []);
  };
  useEffect(() => { load(); }, []);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Couldn't copy"); }
  };

  const save = async () => {
    if (!draft.referrer_name.trim()) { toast.error("Referrer name required"); return; }
    const { error } = await (supabase as any).from("sales_referrals").insert(draft);
    if (error) return toast.error(error.message);
    setDraft({ referrer_name: "", referred_name: "", referred_contact: "", notes: "", status: "open" });
    toast.success("Referral logged");
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("sales_referrals").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 text-sm">
          <p className="font-medium">Trigger</p>
          <p className="text-muted-foreground">Ask for a referral right after a happy client leaves a 5-star Google review. Recent reviews received are listed below.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold mb-2">Recent 5-star wins</h3>
          {recentReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews logged as received yet.</p>
          ) : (
            <ul className="divide-y">
              {recentReviews.map((r) => (
                <li key={r.id} className="py-2 text-sm flex justify-between">
                  <span>{r.client_name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.asked_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display font-semibold">Referral Ask Script</h3>
            <Button size="sm" variant="outline" onClick={() => copy(REFERRAL_ASK(link))} className="gap-1.5"><Copy className="w-4 h-4" />Copy</Button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/40 border rounded p-4">{REFERRAL_ASK(link)}</pre>
          <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" />Locked</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">Log a referral</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Referrer</Label><Input value={draft.referrer_name} onChange={(e) => setDraft({ ...draft, referrer_name: e.target.value })} /></div>
            <div><Label>Referred person/business</Label><Input value={draft.referred_name} onChange={(e) => setDraft({ ...draft, referred_name: e.target.value })} /></div>
          </div>
          <div><Label>Their contact (phone/email)</Label><Input value={draft.referred_contact} onChange={(e) => setDraft({ ...draft, referred_contact: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
          <Button onClick={save}>Log referral</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold mb-3">Referral pipeline</h2>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals logged yet.</p>
          ) : (
            <ul className="divide-y">
              {referrals.map((r) => (
                <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{r.referrer_name} → {r.referred_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.referred_contact || "—"} · {new Date(r.asked_at).toLocaleDateString()}</p>
                    {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                  </div>
                  <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
