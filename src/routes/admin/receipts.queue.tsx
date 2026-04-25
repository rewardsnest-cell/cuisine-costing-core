import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ExternalLink, AlertCircle, Clock, CheckCircle2, FileSearch, XCircle, Inbox } from "lucide-react";
import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/receipts/queue")({
  head: () => ({
    meta: [
      { title: "Receipt Queue — Admin" },
      { name: "description", content: "Processing status, timestamps, and failures for uploaded receipts." },
    ],
  }),
  component: ReceiptQueuePage,
});

type ReceiptRow = {
  id: string;
  receipt_date: string | null;
  image_url: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  raw_ocr_text: string | null;
  extracted_line_items: any;
};

type StatusKey = "pending" | "needs_review" | "reviewed" | "processed" | "failed" | "other";

const STATUS_META: Record<StatusKey, { label: string; icon: any; tone: string }> = {
  pending:      { label: "Pending",       icon: Clock,        tone: "bg-amber-100 text-amber-900 border-amber-200" },
  needs_review: { label: "Needs Review",  icon: FileSearch,   tone: "bg-blue-100 text-blue-900 border-blue-200" },
  reviewed:     { label: "Reviewed",      icon: CheckCircle2, tone: "bg-indigo-100 text-indigo-900 border-indigo-200" },
  processed:    { label: "Processed",     icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  failed:       { label: "Failed",        icon: XCircle,      tone: "bg-red-100 text-red-900 border-red-200" },
  other:        { label: "Other",         icon: AlertCircle,  tone: "bg-muted text-muted-foreground border-border" },
};

function statusKey(s: string | null): StatusKey {
  if (!s) return "pending";
  if (s in STATUS_META) return s as StatusKey;
  return "other";
}

function fmtMoney(n: number | null) {
  if (n == null || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function fmtAge(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function failureReason(r: ReceiptRow): string | null {
  if (statusKey(r.status) !== "failed") return null;
  const txt = (r.raw_ocr_text || "").trim();
  if (txt) return txt.slice(0, 240);
  if (!r.image_url) return "Missing image";
  return "OCR or matching failed — try Re-run OCR from Receipt Diagnostics.";
}

function ReceiptQueuePage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [search, setSearch] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("receipts")
      .select("id,receipt_date,image_url,total_amount,status,created_at,updated_at,raw_ocr_text,extracted_line_items")
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data ?? []) as ReceiptRow[]);
    setRefreshedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates so the queue reflects OCR completion in real-time
  useEffect(() => {
    const ch = supabase
      .channel("receipts-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<StatusKey | "all", number> = {
      all: rows.length, pending: 0, needs_review: 0, reviewed: 0, processed: 0, failed: 0, other: 0,
    };
    rows.forEach((r) => { c[statusKey(r.status)]++; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && statusKey(r.status) !== statusFilter) return false;
      if (q) {
        const hay = `${r.id} ${r.raw_ocr_text ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/receipts/queue" />
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Receipt Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Processing progress for uploaded receipts — pending, reviewed, processed, and failures with reasons.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-xs text-muted-foreground">Updated {refreshedAt.toLocaleTimeString()}</span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <CountCard label="Total" value={counts.all} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        {(Object.keys(STATUS_META) as StatusKey[]).map((k) => {
          const M = STATUS_META[k];
          return (
            <CountCard
              key={k}
              label={M.label}
              value={counts[k]}
              active={statusFilter === k}
              onClick={() => setStatusFilter(k)}
              icon={M.icon}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <CardTitle className="text-base">Receipts</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Input
              placeholder="Search id or OCR text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:w-64"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_META) as StatusKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No receipts match these filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Failure / Notes</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const k = statusKey(r.status);
                  const M = STATUS_META[k];
                  const Icon = M.icon;
                  const items = Array.isArray(r.extracted_line_items) ? r.extracted_line_items.length : 0;
                  const flagged = Array.isArray(r.extracted_line_items)
                    ? (r.extracted_line_items as any[]).filter((it) => it?.needs_review).length
                    : 0;
                  const reason = failureReason(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border border-border bg-muted/40 overflow-hidden shrink-0">
                            {r.image_url ? <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-muted-foreground truncate max-w-[140px]">{r.id.slice(0, 8)}…</div>
                            <div className="text-xs text-muted-foreground">
                              {r.receipt_date ? new Date(r.receipt_date).toLocaleDateString() : "—"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${M.tone}`}>
                          <Icon className="w-3 h-3" /> {M.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{items}</div>
                        {flagged > 0 && (
                          <div className="text-[10px] text-amber-700">{flagged} flagged</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{fmtMoney(r.total_amount)}</TableCell>
                      <TableCell>
                        <div className="text-xs">{new Date(r.created_at).toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtAge(r.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtAge(r.updated_at)}</div>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        {reason ? (
                          <div className="text-xs text-red-700 line-clamp-2" title={reason}>{reason}</div>
                        ) : k === "needs_review" ? (
                          <div className="text-xs text-blue-700">Awaiting manual match review</div>
                        ) : (
                          <div className="text-xs text-muted-foreground">—</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to="/admin/receipts">
                          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                            Open <ExternalLink className="w-3 h-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountCard({
  label, value, active, onClick, icon: Icon,
}: { label: string; value: number; active: boolean; onClick: () => void; icon?: any }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className="text-xl font-semibold mt-1 text-foreground">{value}</div>
    </button>
  );
}
