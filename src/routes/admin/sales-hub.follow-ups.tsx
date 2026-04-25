import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FOLLOW_UP_EMAIL, PROSPECT_STATUSES } from "@/lib/sales-hub/scripts";

export const Route = createFileRoute("/admin/sales-hub/follow-ups")({
  component: FollowUpsPage,
});

type Prospect = {
  id: string;
  business_name: string;
  city: string;
  type: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  last_contacted: string | null;
  next_follow_up: string | null;
};

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function FollowUpsPage() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sales_prospects")
      .select("id, business_name, city, type, contact_name, email, phone, status, last_contacted, next_follow_up")
      .neq("status", "Archived")
      .neq("status", "Booked")
      .order("last_contacted", { ascending: true, nullsFirst: false });
    if (error) toast.error(error.message);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const queues = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const day1: Prospect[] = [];
    const day5: Prospect[] = [];
    const day14: Prospect[] = [];
    const dueByDate: Prospect[] = [];
    for (const p of rows) {
      if (p.next_follow_up && p.next_follow_up <= today) { dueByDate.push(p); continue; }
      const d = daysSince(p.last_contacted);
      if (d === null) continue;
      if (d >= 14) day14.push(p);
      else if (d >= 5) day5.push(p);
      else if (d >= 1) day1.push(p);
    }
    return { dueByDate, day1, day5, day14 };
  }, [rows]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("sales_prospects").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Couldn't copy"); }
  };

  const renderQueue = (label: string, list: Prospect[], emailDay?: 1 | 5 | 14) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold">{label}</h3>
          <Badge variant="secondary">{list.length}</Badge>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this queue right now.</p>
        ) : (
          <ul className="divide-y">
            {list.map((p) => (
              <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{p.business_name} <span className="text-xs text-muted-foreground">· {p.city}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {p.contact_name || "—"} · {p.email || p.phone || "no contact"} · last: {p.last_contacted ? new Date(p.last_contacted).toLocaleDateString() : "never"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROSPECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        )}
        {emailDay && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-primary">Show Day {emailDay} email template</summary>
            <div className="mt-2 space-y-2">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/40 border rounded p-4">{FOLLOW_UP_EMAIL(emailDay)}</pre>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(FOLLOW_UP_EMAIL(emailDay))}><Copy className="w-3.5 h-3.5" />Copy template</Button>
              <Badge variant="outline" className="gap-1 ml-2"><Lock className="w-3 h-3" />Locked</Badge>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 text-sm">
          <p className="font-medium">How follow-ups work</p>
          <p className="text-muted-foreground">Day 1, Day 5, and Day 14 queues are calculated from each prospect's <em>last contacted</em> date. The "Due by date" queue uses the <em>next follow-up</em> field on a prospect. Statuses <strong>Booked</strong> and <strong>Archived</strong> are excluded automatically.</p>
        </CardContent>
      </Card>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          {renderQueue("Due by date (next follow-up reached)", queues.dueByDate)}
          {renderQueue("Day 1 follow-up", queues.day1, 1)}
          {renderQueue("Day 5 follow-up", queues.day5, 5)}
          {renderQueue("Day 14 final follow-up", queues.day14, 14)}
          <p className="text-xs text-muted-foreground text-center">
            Need to add prospects? <Link to="/admin/sales-hub/prospects" className="text-primary hover:underline">Open prospect lists</Link>.
          </p>
        </>
      )}
    </div>
  );
}
