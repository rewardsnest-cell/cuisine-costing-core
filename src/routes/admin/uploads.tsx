import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, FileSearch, Tag, ExternalLink, ImageIcon, Inbox } from "lucide-react";

export const Route = createFileRoute("/admin/uploads")({
  head: () => ({
    meta: [
      { title: "Uploads — Admin" },
      { name: "description", content: "Unified feed of receipts, competitor quotes, and sale flyers." },
    ],
  }),
  component: UploadsPage,
});

type UploadType = "receipt" | "competitor_quote" | "sale_flyer";

type UploadRow = {
  id: string;
  type: UploadType;
  title: string;
  subtitle: string | null;
  status: string;
  created_at: string;
  image_url: string | null;
  href: string;
  amount: number | null;
};

const TYPE_META: Record<UploadType, { label: string; icon: any; tone: string }> = {
  receipt: { label: "Receipt", icon: Receipt, tone: "bg-amber-100 text-amber-900 border-amber-200" },
  competitor_quote: { label: "Competitor Quote", icon: FileSearch, tone: "bg-blue-100 text-blue-900 border-blue-200" },
  sale_flyer: { label: "Sale Flyer", icon: Tag, tone: "bg-emerald-100 text-emerald-900 border-emerald-200" },
};

function fmtMoney(n: number | null) {
  if (n == null || isNaN(Number(n))) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function UploadsPage() {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | UploadType>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [rcp, cq, sf] = await Promise.all([
        supabase.from("receipts").select("id,receipt_date,image_url,total_amount,status,created_at,raw_ocr_text").order("created_at", { ascending: false }).limit(200),
        supabase.from("competitor_quotes").select("id,competitor_name,client_name,event_type,event_date,total,outcome,created_at,source_image_url").eq("archived", false).order("created_at", { ascending: false }).limit(200),
        supabase.from("sale_flyers").select("id,title,status,sale_start_date,sale_end_date,image_url,created_at").order("created_at", { ascending: false }).limit(200),
      ]);

      const merged: UploadRow[] = [];
      (rcp.data ?? []).forEach((r: any) => {
        merged.push({
          id: r.id,
          type: "receipt",
          title: `Receipt · ${new Date(r.receipt_date).toLocaleDateString()}`,
          subtitle: r.raw_ocr_text ? r.raw_ocr_text.slice(0, 80) : null,
          status: r.status ?? "pending",
          created_at: r.created_at,
          image_url: r.image_url,
          href: "/admin/receipts",
          amount: r.total_amount,
        });
      });
      (cq.data ?? []).forEach((r: any) => {
        merged.push({
          id: r.id,
          type: "competitor_quote",
          title: r.competitor_name || "Unknown competitor",
          subtitle: [r.client_name, r.event_type, r.event_date && new Date(r.event_date).toLocaleDateString()].filter(Boolean).join(" · ") || null,
          status: r.outcome ?? "pending",
          created_at: r.created_at,
          image_url: r.source_image_url,
          href: `/admin/competitor-quotes/${r.id}`,
          amount: r.total,
        });
      });
      (sf.data ?? []).forEach((r: any) => {
        merged.push({
          id: r.id,
          type: "sale_flyer",
          title: r.title || "Sale flyer",
          subtitle: [r.sale_start_date && `from ${new Date(r.sale_start_date).toLocaleDateString()}`, r.sale_end_date && `to ${new Date(r.sale_end_date).toLocaleDateString()}`].filter(Boolean).join(" ") || null,
          status: r.status ?? "pending",
          created_at: r.created_at,
          image_url: r.image_url,
          href: "/admin/scan-flyer",
          amount: null,
        });
      });

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(merged);
      setLoading(false);
    })();
  }, []);

  const allStatuses = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.status));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !`${r.title} ${r.subtitle ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, typeFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: rows.length, receipt: 0, competitor_quote: 0, sale_flyer: 0 };
    rows.forEach((r) => { (c as any)[r.type]++; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Uploads</h1>
        <p className="text-sm text-muted-foreground mt-1">All receipts, competitor quotes, and sale flyers in one feed.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CountCard label="Total" value={counts.all} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
        <CountCard label="Receipts" value={counts.receipt} active={typeFilter === "receipt"} onClick={() => setTypeFilter("receipt")} icon={Receipt} />
        <CountCard label="Competitor Quotes" value={counts.competitor_quote} active={typeFilter === "competitor_quote"} onClick={() => setTypeFilter("competitor_quote")} icon={FileSearch} />
        <CountCard label="Sale Flyers" value={counts.sale_flyer} active={typeFilter === "sale_flyer"} onClick={() => setTypeFilter("sale_flyer")} icon={Tag} />
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <CardTitle className="text-base">Recent uploads</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Input
              placeholder="Search title or notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:w-56"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {allStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
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
              <p className="text-sm text-muted-foreground">No uploads match these filters.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const meta = TYPE_META[r.type];
                const Icon = meta.icon;
                const money = fmtMoney(r.amount);
                return (
                  <li key={`${r.type}-${r.id}`} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                    <div className="w-12 h-12 shrink-0 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden">
                      {r.image_url ? (
                        <img src={r.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${meta.tone}`}>
                          <Icon className="w-3 h-3" /> {meta.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-foreground mt-1 truncate">{r.title}</div>
                      {r.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                      )}
                    </div>
                    {money && <div className="text-sm font-semibold whitespace-nowrap">{money}</div>}
                    <Link to={r.href}>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                        Open <ExternalLink className="w-3 h-3" />
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
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
      className={`text-left rounded-xl border p-4 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 text-foreground">{value}</div>
    </button>
  );
}
