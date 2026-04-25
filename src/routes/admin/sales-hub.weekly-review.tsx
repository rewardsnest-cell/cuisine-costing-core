import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sales-hub/weekly-review")({
  component: WeeklyReviewPage,
});

function getWeekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().slice(0, 10);
}

function WeeklyReviewPage() {
  const { user } = useAuth();
  const weekStart = getWeekStart();
  const [outreachCount, setOutreachCount] = useState<number | null>(null);
  const [reviewsCount, setReviewsCount] = useState<number | null>(null);
  const [bookingsCount, setBookingsCount] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({
    bookings_added: 0,
    reviews_gained: 0,
    best_review_text: "",
    improvement_note: "",
    next_week_plan: "",
    completed: false,
  });
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    const weekStartIso = `${weekStart}T00:00:00`;
    const [out, rev, book, existing] = await Promise.all([
      (supabase as any).from("sales_contact_log").select("id", { count: "exact", head: true }).gte("contacted_at", weekStartIso),
      (supabase as any).from("sales_review_asks").select("id", { count: "exact", head: true }).eq("review_received", true).gte("asked_at", weekStartIso),
      (supabase as any).from("quotes").select("id", { count: "exact", head: true }).gte("created_at", weekStartIso),
      (supabase as any).from("sales_weekly_reviews").select("*").eq("week_start", weekStart).eq("user_id", user.id).maybeSingle(),
    ]);
    setOutreachCount(out.count ?? 0);
    setReviewsCount(rev.count ?? 0);
    setBookingsCount(book.count ?? 0);
    if (existing?.data) setDraft({ ...draft, ...existing.data });
    setLoaded(true);
  };
  useEffect(() => { load(); }, [user]);

  const save = async (markComplete = false) => {
    if (!user) return;
    const payload = { ...draft, completed: markComplete || draft.completed, week_start: weekStart, user_id: user.id };
    const { error } = await (supabase as any).from("sales_weekly_reviews").upsert(payload, { onConflict: "week_start,user_id" });
    if (error) return toast.error(error.message);
    toast.success(markComplete ? "Week marked complete" : "Saved");
    load();
  };

  const checks = [
    { label: "25+ outreach actions completed", done: (outreachCount ?? 0) >= 25, hint: `${outreachCount ?? 0} / 25 logged this week` },
    { label: "New bookings added", done: (bookingsCount ?? 0) > 0, hint: `${bookingsCount ?? 0} new this week` },
    { label: "Reviews gained", done: (reviewsCount ?? 0) > 0, hint: `${reviewsCount ?? 0} received this week` },
    { label: "Best review saved", done: !!draft.best_review_text?.trim(), hint: "Paste it below" },
    { label: "One improvement identified", done: !!draft.improvement_note?.trim(), hint: "Note it below" },
    { label: "Next week planned", done: !!draft.next_week_plan?.trim(), hint: "Outline it below" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <h2 className="font-display text-lg font-semibold">Week of {new Date(weekStart).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</h2>
          <p className="text-xs text-muted-foreground">Counts auto-update from your contact log, review asks, and new quotes.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-display font-semibold mb-3">Weekly Checklist</h3>
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.label} className={`flex items-center gap-3 px-3 py-2 rounded border ${c.done ? "bg-success/10 border-success/30" : "bg-muted/30 border-border"}`}>
                <Checkbox checked={c.done} disabled />
                <div className="flex-1">
                  <p className={`text-sm ${c.done ? "line-through text-muted-foreground" : ""}`}>{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.hint}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <div><Label>Best review this week</Label><Textarea rows={2} value={draft.best_review_text || ""} onChange={(e) => setDraft({ ...draft, best_review_text: e.target.value })} placeholder="Copy/paste the standout review…" /></div>
          <div><Label>One improvement identified</Label><Textarea rows={2} value={draft.improvement_note || ""} onChange={(e) => setDraft({ ...draft, improvement_note: e.target.value })} placeholder="What did we learn? What changes next week?" /></div>
          <div><Label>Next week's plan</Label><Textarea rows={3} value={draft.next_week_plan || ""} onChange={(e) => setDraft({ ...draft, next_week_plan: e.target.value })} placeholder="3–5 specific actions for next week" /></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={!loaded}>Save draft</Button>
            <Button onClick={() => save(true)} disabled={!loaded}>Mark week complete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
