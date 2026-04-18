import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trophy, X as XIcon, Clock, FileSearch, ExternalLink, Eye, Download, Upload, RefreshCw, Trash2 } from "lucide-react";
import { BulkCompetitorUpload } from "@/components/competitor/BulkCompetitorUpload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/admin/competitor-quotes")({
  head: () => ({
    meta: [
      { title: "Competitor Quotes — Admin" },
      { name: "description", content: "Saved competitor quote analyses with win/loss tracking and trends." },
    ],
  }),
  component: CompetitorQuotesPage,
});

type Outcome = "pending" | "won" | "lost";

type Row = {
  id: string;
  created_at: string;
  client_name: string | null;
  client_email: string | null;
  client_user_id: string | null;
  competitor_name: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number | null;
  per_guest_price: number | null;
  total: number | null;
  subtotal: number | null;
  taxes: number | null;
  gratuity: number | null;
  service_style: string | null;
  outcome: Outcome;
  counter_quote_id: string | null;
  notes: string | null;
  counter_total: number | null;
  analysis: any;
  source_image_url: string | null;
};

const OUTCOME_META: Record<Outcome, { label: string; className: string; icon: any }> = {
  won: { label: "Won", className: "bg-green-100 text-green-800 hover:bg-green-100", icon: Trophy },
  lost: { label: "Lost", className: "bg-red-100 text-red-800 hover:bg-red-100", icon: XIcon },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800 hover:bg-amber-100", icon: Clock },
};

function CompetitorQuotesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | Outcome>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const deleteQuote = async (row: Row) => {
    setDeleting(row.id);
    try {
      if (row.counter_quote_id) {
        await supabase.from("competitor_quotes").update({ counter_quote_id: null }).eq("id", row.id);
        await supabase.from("quote_items").delete().eq("quote_id", row.counter_quote_id);
        await supabase.from("quotes").delete().eq("id", row.counter_quote_id);
      }
      const { error } = await supabase.from("competitor_quotes").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Competitor quote deleted");
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      setConfirmDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  const rebuildCounter = async (id: string) => {
    setRebuilding(id);
    try {
      const { data, error } = await supabase.functions.invoke("build-counter-quote", {
        body: { competitorQuoteId: id },
      });
      if (error) throw error;
      const stats = (data as any)?.stats;
      toast.success(
        `Counter rebuilt${stats ? ` · ${stats.aiCreated ?? 0} new recipe${stats.aiCreated === 1 ? "" : "s"}` : ""}`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rebuild counter quote");
    } finally {
      setRebuilding(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competitor_quotes")
      .select("id,created_at,client_name,client_email,client_user_id,competitor_name,event_type,event_date,guest_count,per_guest_price,total,subtotal,taxes,gratuity,service_style,outcome,counter_quote_id,notes,analysis,source_image_url,counter:quotes!competitor_quotes_counter_quote_id_fkey(total)")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      const mapped: Row[] = (data ?? []).map((d: any) => ({
        ...d,
        counter_total: d.counter?.total ?? null,
      }));
      setRows(mapped);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
      if (clientFilter) {
        const q = clientFilter.toLowerCase();
        const hay = `${r.client_name ?? ""} ${r.client_email ?? ""} ${r.competitor_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fromDate && r.created_at < fromDate) return false;
      if (toDate && r.created_at > `${toDate}T23:59:59`) return false;
      return true;
    });
  }, [rows, clientFilter, outcomeFilter, fromDate, toDate]);

  const stats = useMemo(() => {
    const won = filtered.filter((r) => r.outcome === "won").length;
    const lost = filtered.filter((r) => r.outcome === "lost").length;
    const pending = filtered.filter((r) => r.outcome === "pending").length;
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
    const totals = filtered.map((r) => Number(r.total ?? 0)).filter((n) => n > 0);
    const avgTotal = totals.length ? totals.reduce((s, n) => s + n, 0) / totals.length : 0;
    const paired = filtered.filter((r) => Number(r.total ?? 0) > 0 && Number(r.counter_total ?? 0) > 0);
    const gaps = paired.map((r) => Number(r.counter_total) - Number(r.total));
    const avgGap = gaps.length ? gaps.reduce((s, n) => s + n, 0) / gaps.length : 0;
    const perGuestGaps = paired
      .filter((r) => Number(r.guest_count ?? 0) > 0)
      .map((r) => (Number(r.counter_total) - Number(r.total)) / Number(r.guest_count));
    const avgGapPerGuest = perGuestGaps.length ? perGuestGaps.reduce((s, n) => s + n, 0) / perGuestGaps.length : 0;
    return { total: filtered.length, won, lost, pending, winRate, avgTotal, avgGap, gapCount: gaps.length, avgGapPerGuest, perGuestGapCount: perGuestGaps.length };
  }, [filtered]);

  const setOutcome = async (id: string, outcome: Outcome) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, outcome } : r)));
    const { error } = await supabase.from("competitor_quotes").update({ outcome }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setRows(prev);
    } else {
      toast.success(`Marked as ${outcome}`);
    }
  };

  const fmtMoney = (n: number | null | undefined) =>
    n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
  const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString() : "—");

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const headers = [
      "Created", "Client", "Email", "Competitor", "Event type", "Event date",
      "Guests", "Per guest", "Subtotal", "Taxes", "Gratuity", "Total",
      "Service style", "Outcome", "Counter total", "Gap", "Notes",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const gap = r.total != null && r.counter_total != null ? Number(r.counter_total) - Number(r.total) : "";
      lines.push([
        new Date(r.created_at).toISOString(),
        r.client_name ?? "", r.client_email ?? "", r.competitor_name ?? "",
        r.event_type ?? "", r.event_date ?? "",
        r.guest_count ?? "", r.per_guest_price ?? "", r.subtotal ?? "",
        r.taxes ?? "", r.gratuity ?? "", r.total ?? "",
        r.service_style ?? "", r.outcome, r.counter_total ?? "", gap,
        r.notes ?? "",
      ].map(esc).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `competitor-quotes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} row${filtered.length === 1 ? "" : "s"}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Competitor Quotes</h1>
          <p className="text-sm text-muted-foreground mt-1">All saved competitor analyses with win/loss tracking.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={exportCsv}>
            <Download className="w-4 h-4" />Export CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setBulkOpen(true)}>
            <Upload className="w-4 h-4" />Bulk upload
          </Button>
          <Link to="/admin/quotes">
            <Button variant="outline" className="gap-2"><FileSearch className="w-4 h-4" />Analyze New Quote</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Analyses" value={stats.total.toString()} />
        <StatCard label="Won" value={stats.won.toString()} tone="green" />
        <StatCard label="Lost" value={stats.lost.toString()} tone="red" />
        <StatCard label="Win rate" value={`${stats.winRate}%`} />
        <StatCard label="Avg total" value={fmtMoney(stats.avgTotal)} />
        <StatCard
          label={`Avg gap vs counter (${stats.gapCount})`}
          value={`${stats.avgGap >= 0 ? "+" : ""}${fmtMoney(stats.avgGap)}`}
          tone={stats.avgGap >= 0 ? "green" : "red"}
        />
        <StatCard
          label={`Avg gap / guest (${stats.perGuestGapCount})`}
          value={`${stats.avgGapPerGuest >= 0 ? "+" : ""}${fmtMoney(stats.avgGapPerGuest)}`}
          tone={stats.avgGapPerGuest >= 0 ? "green" : "red"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PriceGapChart rows={filtered} />
        <WinRateChart rows={filtered} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Client / competitor</Label>
            <Input placeholder="Search…" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Outcome</Label>
            <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No competitor quotes match your filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Guests</TableHead>
                  <TableHead className="text-right">Per guest</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Counter</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const meta = OUTCOME_META[r.outcome];
                  const Icon = meta.icon;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.client_name || "Guest"}</div>
                        {r.client_email && <div className="text-xs text-muted-foreground">{r.client_email}</div>}
                        {r.client_user_id && <Badge variant="outline" className="mt-1 text-[10px]">linked</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{r.competitor_name || "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.event_type || "—"}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(r.event_date)}{r.service_style ? ` · ${r.service_style}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.guest_count ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(r.per_guest_price)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmtMoney(r.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={meta.className}><Icon className="w-3 h-3 mr-1" />{meta.label}</Badge>
                          <Select value={r.outcome} onValueChange={(v) => setOutcome(r.id, v as Outcome)}>
                            <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="won">Won</SelectItem>
                              <SelectItem value="lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.counter_quote_id ? (
                          <Link to="/admin/quotes" className="text-primary text-xs inline-flex items-center gap-1 hover:underline">
                            View <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            onClick={() => rebuildCounter(r.id)}
                            disabled={rebuilding === r.id}
                            title={r.counter_quote_id ? "Rebuild counter quote" : "Build counter quote"}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${rebuilding === r.id ? "animate-spin" : ""}`} />
                            {r.counter_quote_id ? "Rebuild" : "Build"}
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setViewing(r)}>
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(r)}
                            title="Delete competitor quote"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AnalysisDialog row={viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <BulkCompetitorUpload open={bulkOpen} onOpenChange={setBulkOpen} onComplete={load} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  const toneClass = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

const gapChartConfig = {
  competitor: { label: "Competitor", color: "hsl(var(--chart-1, 12 76% 61%))" },
  counter: { label: "Our counter", color: "hsl(var(--chart-2, 173 58% 39%))" },
} satisfies ChartConfig;

function PriceGapChart({ rows }: { rows: Row[] }) {
  const data = useMemo(() => {
    return rows
      .filter((r) => Number(r.total ?? 0) > 0 && Number(r.counter_total ?? 0) > 0)
      .map((r) => ({
        date: new Date(r.created_at).getTime(),
        label: new Date(r.created_at).toLocaleDateString(),
        competitor: Number(r.total),
        counter: Number(r.counter_total),
        gap: Number(r.counter_total) - Number(r.total),
      }))
      .sort((a, b) => a.date - b.date);
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Price gap over time</CardTitle>
        <p className="text-xs text-muted-foreground">Competitor total vs our counter-quote total ({data.length} pairs)</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No analyses with linked counter-quotes yet. Create a draft counter from an analysis to see the gap here.
          </div>
        ) : (
          <ChartContainer config={gapChartConfig} className="h-[280px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="competitor" stroke="var(--color-competitor)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="counter" stroke="var(--color-counter)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

const winRateChartConfig = {
  winRate: { label: "Win rate %", color: "hsl(var(--chart-2, 173 58% 39%))" },
} satisfies ChartConfig;

function WinRateChart({ rows }: { rows: Row[] }) {
  const data = useMemo(() => {
    const buckets = new Map<string, { won: number; lost: number }>();
    for (const r of rows) {
      if (r.outcome !== "won" && r.outcome !== "lost") continue;
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key) ?? { won: 0, lost: 0 };
      b[r.outcome]++;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => {
        const decided = b.won + b.lost;
        const [y, m] = key.split("-");
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
        return { label, winRate: decided > 0 ? Math.round((b.won / decided) * 100) : 0, decided };
      });
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Win rate over time</CardTitle>
        <p className="text-xs text-muted-foreground">Monthly win rate from decided analyses ({data.length} month{data.length === 1 ? "" : "s"})</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Mark analyses as Won or Lost to see your monthly win rate here.
          </div>
        ) : (
          <ChartContainer config={winRateChartConfig} className="h-[280px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Line type="monotone" dataKey="winRate" stroke="var(--color-winRate)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisDialog({ row, onOpenChange }: { row: Row | null; onOpenChange: (open: boolean) => void }) {
  const fmtMoney = (n: number | null | undefined) =>
    n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));

  const lineItems = useMemo<any[]>(() => {
    if (!row?.analysis) return [];
    const a = row.analysis as any;
    const candidates = [a.lineItems, a.line_items, a.items, a.menu, a.menuItems];
    for (const c of candidates) if (Array.isArray(c) && c.length) return c;
    return [];
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Competitor analysis</DialogTitle>
          <DialogDescription>
            {row?.competitor_name || "Unknown competitor"} · {row?.client_name || "Guest"}
            {row?.event_date ? ` · ${new Date(row.event_date).toLocaleDateString()}` : ""}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field label="Guests" value={row.guest_count?.toString() ?? "—"} />
              <Field label="Per guest" value={fmtMoney(row.per_guest_price)} />
              <Field label="Subtotal" value={fmtMoney(row.subtotal)} />
              <Field label="Taxes" value={fmtMoney(row.taxes)} />
              <Field label="Gratuity" value={fmtMoney(row.gratuity)} />
              <Field label="Total" value={fmtMoney(row.total)} />
              <Field label="Style" value={row.service_style || "—"} />
              <Field label="Event type" value={row.event_type || "—"} />
            </div>

            <Tabs defaultValue="items">
              <TabsList>
                <TabsTrigger value="items">Line items ({lineItems.length})</TabsTrigger>
                <TabsTrigger value="image">Source image</TabsTrigger>
                <TabsTrigger value="json">Raw JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-3">
                {lineItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                    No structured line items in analysis.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((li, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">
                              <div className="font-medium">{li.name ?? li.item ?? li.title ?? "Item"}</div>
                              {li.description && <div className="text-xs text-muted-foreground">{li.description}</div>}
                            </TableCell>
                            <TableCell className="text-right text-sm">{li.qty ?? li.quantity ?? "—"}</TableCell>
                            <TableCell className="text-right text-sm">{fmtMoney(li.unitPrice ?? li.unit_price ?? li.price)}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{fmtMoney(li.total ?? li.totalPrice ?? li.total_price)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="image" className="mt-3">
                {row.source_image_url ? (
                  <a href={row.source_image_url} target="_blank" rel="noreferrer" className="block">
                    <img src={row.source_image_url} alt="Source competitor quote" className="max-h-[60vh] w-auto mx-auto rounded-md border" />
                  </a>
                ) : (
                  <div className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                    No source image saved with this analysis.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="json" className="mt-3">
                <pre className="text-xs bg-muted/40 p-3 rounded-md overflow-x-auto max-h-[60vh]">
                  {JSON.stringify(row.analysis ?? {}, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>

            {row.notes && (
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="p-3 border rounded-md whitespace-pre-wrap">{row.notes}</div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
