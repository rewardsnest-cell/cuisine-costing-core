import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Clock, Download, Users, Check, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/timesheet")({
  component: TimesheetPage,
});

type ApprovalStatus = "pending" | "approved" | "disputed";
type Entry = {
  id: string;
  employee_user_id: string;
  quote_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  approval_status: ApprovalStatus;
};

type Profile = { user_id: string; full_name: string | null; email: string | null };
type Quote = { id: string; reference_number: string | null; event_type: string | null; event_date: string | null; client_name: string | null };
type EmpProfile = { user_id: string; hourly_rate: number | null };

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDuration(ms: number) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function hoursDecimal(ms: number) {
  return ms / 3_600_000;
}

function TimesheetPage() {
  const today = new Date();
  const defaultStart = startOfWeek(today);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultEnd.getDate() + 13); // 2-week pay period

  const [start, setStart] = useState(fmtDate(defaultStart));
  const [end, setEnd] = useState(fmtDate(defaultEnd));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [onlyApproved, setOnlyApproved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const startIso = new Date(start + "T00:00:00").toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();
      const { data: ents } = await (supabase as any)
        .from("event_time_entries")
        .select("id, employee_user_id, quote_id, clock_in_at, clock_out_at, approval_status")
        .gte("clock_in_at", startIso)
        .lte("clock_in_at", endIso)
        .order("clock_in_at", { ascending: true });
      const list = (ents as Entry[]) || [];
      setEntries(list);

      const userIds = Array.from(new Set(list.map((e) => e.employee_user_id)));
      const quoteIds = Array.from(new Set(list.map((e) => e.quote_id)));

      const [pRes, qRes, eRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
          : Promise.resolve({ data: [] as Profile[] } as any),
        quoteIds.length
          ? supabase.from("quotes").select("id, reference_number, event_type, event_date, client_name").in("id", quoteIds)
          : Promise.resolve({ data: [] as Quote[] } as any),
        userIds.length
          ? (supabase as any).from("employee_profiles").select("user_id, hourly_rate").in("user_id", userIds)
          : Promise.resolve({ data: [] as EmpProfile[] } as any),
      ]);

      const pm = new Map<string, Profile>();
      for (const p of (pRes as any).data || []) pm.set(p.user_id, p);
      setProfiles(pm);

      const qm = new Map<string, Quote>();
      for (const q of (qRes as any).data || []) qm.set(q.id, q);
      setQuotes(qm);

      const rm = new Map<string, number>();
      for (const r of (eRes as any).data || []) rm.set(r.user_id, Number(r.hourly_rate) || 0);
      setRates(rm);

      setLoading(false);
    })();
  }, [start, end, refreshTick]);

  const setApproval = async (id: string, status: ApprovalStatus) => {
    const { error } = await (supabase as any)
      .from("event_time_entries")
      .update({
        approval_status: status,
        approved_at: status === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${status}`);
    setRefreshTick((t) => t + 1);
  };

  const bulkApprovePending = async (entryIds: string[]) => {
    if (entryIds.length === 0) return;
    const { error } = await (supabase as any)
      .from("event_time_entries")
      .update({ approval_status: "approved", approved_at: new Date().toISOString() })
      .in("id", entryIds);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Approved ${entryIds.length} shift${entryIds.length === 1 ? "" : "s"}`);
    setRefreshTick((t) => t + 1);
  };

  type EmpRow = {
    userId: string;
    name: string;
    email: string;
    totalMs: number;
    rate: number;
    rows: { entry: Entry; ms: number; quote?: Quote }[];
  };

  const grouped = useMemo<EmpRow[]>(() => {
    const map = new Map<string, EmpRow>();
    for (const e of entries) {
      if (!e.clock_out_at) continue; // only completed shifts count
      if (onlyApproved && e.approval_status !== "approved") continue;
      const ms = new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime();
      const p = profiles.get(e.employee_user_id);
      const existing = map.get(e.employee_user_id) || {
        userId: e.employee_user_id,
        name: p?.full_name || p?.email || "Unknown",
        email: p?.email || "",
        totalMs: 0,
        rate: rates.get(e.employee_user_id) || 0,
        rows: [],
      };
      existing.totalMs += ms;
      existing.rows.push({ entry: e, ms, quote: quotes.get(e.quote_id) });
      map.set(e.employee_user_id, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, profiles, quotes, rates, onlyApproved]);

  const pendingCount = entries.filter((e) => e.clock_out_at && e.approval_status === "pending").length;
  const allPendingIds = entries.filter((e) => e.clock_out_at && e.approval_status === "pending").map((e) => e.id);

  const grandMs = grouped.reduce((s, g) => s + g.totalMs, 0);
  const grandPay = grouped.reduce((s, g) => s + hoursDecimal(g.totalMs) * g.rate, 0);

  const exportCsv = () => {
    const rows = [
      ["Employee", "Email", "Event", "Event Date", "Quote Ref", "Clock In", "Clock Out", "Hours", "Hourly Rate", "Pay", "Status"],
    ];
    for (const g of grouped) {
      for (const r of g.rows) {
        const hrs = hoursDecimal(r.ms);
        rows.push([
          g.name,
          g.email,
          r.quote?.event_type || "",
          r.quote?.event_date || "",
          r.quote?.reference_number || "",
          new Date(r.entry.clock_in_at).toISOString(),
          r.entry.clock_out_at ? new Date(r.entry.clock_out_at).toISOString() : "",
          hrs.toFixed(2),
          g.rate.toFixed(2),
          (hrs * g.rate).toFixed(2),
          r.entry.approval_status,
        ]);
      }
      rows.push([
        g.name,
        g.email,
        "TOTAL",
        "",
        "",
        "",
        "",
        hoursDecimal(g.totalMs).toFixed(2),
        g.rate.toFixed(2),
        (hoursDecimal(g.totalMs) * g.rate).toFixed(2),
        "",
      ]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Clock className="w-5 h-5" /> Timesheet
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Total hours per employee for the selected pay period.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Start</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={onlyApproved}
                onChange={(e) => setOnlyApproved(e.target.checked)}
                className="rounded"
              />
              Approved only
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const s = startOfWeek(new Date());
                const e = new Date(s);
                e.setDate(e.getDate() + 6);
                setStart(fmtDate(s));
                setEnd(fmtDate(e));
              }}
            >
              This week
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const s = startOfWeek(new Date());
                const e = new Date(s);
                e.setDate(e.getDate() + 13);
                setStart(fmtDate(s));
                setEnd(fmtDate(e));
              }}
            >
              2 weeks
            </Button>
            {pendingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkApprovePending(allPendingIds)}
                className="gap-2"
              >
                <Check className="w-4 h-4" /> Approve {pendingCount} pending
              </Button>
            )}
            <Button onClick={exportCsv} className="gap-2" disabled={grouped.length === 0}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> Employees
            </p>
            <p className="font-display text-2xl font-bold">{grouped.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total hours</p>
            <p className="font-display text-2xl font-bold">{fmtDuration(grandMs)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total pay (est.)</p>
            <p className="font-display text-2xl font-bold">${grandPay.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">By employee</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No completed shifts in this range.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.userId} className="border border-border/50 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-3 p-3 bg-muted/30 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g.email}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {g.rate > 0 ? `$${g.rate.toFixed(2)}/hr` : "No rate set"}
                      </span>
                      <span className="font-display font-bold">{fmtDuration(g.totalMs)}</span>
                      <span className="font-display font-bold text-primary">
                        ${(hoursDecimal(g.totalMs) * g.rate).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-background">
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 px-3 font-medium">Event</th>
                        <th className="py-2 px-3 font-medium">Date</th>
                        <th className="py-2 px-3 font-medium">In</th>
                        <th className="py-2 px-3 font-medium">Out</th>
                        <th className="py-2 px-3 font-medium text-right">Hours</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                        <th className="py-2 px-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => {
                        const status = r.entry.approval_status;
                        return (
                          <tr key={r.entry.id} className="border-t border-border/40">
                            <td className="py-1.5 px-3">
                              {r.quote?.event_type || "—"}
                              {r.quote?.client_name ? ` · ${r.quote.client_name}` : ""}
                            </td>
                            <td className="py-1.5 px-3 text-muted-foreground">
                              {r.quote?.event_date || ""}
                            </td>
                            <td className="py-1.5 px-3 text-muted-foreground">
                              {new Date(r.entry.clock_in_at).toLocaleString([], {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="py-1.5 px-3 text-muted-foreground">
                              {r.entry.clock_out_at
                                ? new Date(r.entry.clock_out_at).toLocaleTimeString([], {
                                    timeStyle: "short",
                                  })
                                : "—"}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono">
                              {hoursDecimal(r.ms).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3">
                              <Badge
                                variant={
                                  status === "approved"
                                    ? "default"
                                    : status === "disputed"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="capitalize text-[10px]"
                              >
                                {status}
                              </Badge>
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <div className="inline-flex gap-1">
                                {status !== "approved" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Approve"
                                    onClick={() => setApproval(r.entry.id, "approved")}
                                  >
                                    <Check className="w-3.5 h-3.5 text-success" />
                                  </Button>
                                )}
                                {status !== "disputed" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Dispute"
                                    onClick={() => setApproval(r.entry.id, "disputed")}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                                  </Button>
                                )}
                                {status !== "pending" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Reset to pending"
                                    onClick={() => setApproval(r.entry.id, "pending")}
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
